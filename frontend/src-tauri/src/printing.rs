use std::sync::Mutex;

use futures::lock::Mutex as AsyncMutex;
use powersync::PowerSyncDatabase;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::receipt::{self, ReceiptConfig, ReceiptData, ReceiptLayout};

const SCHEMA: &str = include_str!("receipt-schema.sql");
const NOW: &str = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TerminalSettings {
  config: ReceiptConfig,
  auto_print: bool,
  copy_count: u32,
  printer: String,
  virtual_outcome: String,
}

impl TerminalSettings {
  fn validate(&self) -> Result<(), String> {
    receipt::validate_config(&self.config)?;
    if !(1..=5).contains(&self.copy_count) {
      return Err("Copy count must be between 1 and 5.".into());
    }
    if self.printer != "none" && !(cfg!(debug_assertions) && self.printer == "virtual") {
      return Err(
        "This printer is unavailable. Virtual printing requires a development build.".into(),
      );
    }
    if ![
      "success",
      "disconnected",
      "write_failure",
      "uncertain",
      "interrupted",
    ]
    .contains(&self.virtual_outcome.as_str())
      || (!cfg!(debug_assertions) && self.virtual_outcome != "success")
    {
      return Err("Invalid or unavailable virtual printer outcome.".into());
    }
    Ok(())
  }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
  version: u32,
  data: ReceiptData,
  config: ReceiptConfig,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintAttempt {
  id: i64,
  printer: String,
  status: String,
  error: Option<String>,
  layout: Option<ReceiptLayout>,
  escpos: Option<Vec<u8>>,
  created_at: String,
  finished_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintJob {
  id: String,
  sale_id: String,
  invoice_number: String,
  is_copy: bool,
  copy_count: u32,
  status: String,
  error: Option<String>,
  created_at: String,
  attempts: Vec<PrintAttempt>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedReceipt {
  sale_id: String,
  invoice_number: String,
  created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptHistory {
  receipts: Vec<SavedReceipt>,
  jobs: Vec<PrintJob>,
  worker_error: Option<String>,
}

#[derive(Default)]
pub struct PrintQueue {
  database: AsyncMutex<Option<PowerSyncDatabase>>,
  worker_error: Mutex<Option<String>>,
}

fn db_error(error: impl std::fmt::Display) -> String {
  format!("Receipt storage error: {error}")
}

fn install(connection: &Connection) -> Result<(), String> {
  connection.execute_batch(SCHEMA).map_err(db_error)
}

fn recover(connection: &Connection) -> Result<(), String> {
  connection
    .execute_batch(&format!(
      "UPDATE receipt_print_attempts SET status = 'uncertain',
       error = 'Application stopped during delivery. Output may already exist.',
       finished_at = {NOW} WHERE status = 'sending';
     UPDATE receipt_print_jobs SET status = 'uncertain',
       error = 'Application stopped during delivery. Confirm before retrying.',
       updated_at = {NOW} WHERE status = 'sending';"
    ))
    .map_err(db_error)
}

pub async fn initialize<R: tauri::Runtime>(
  app: &tauri::AppHandle<R>,
  database: PowerSyncDatabase,
) -> Result<(), String> {
  let queue = app.state::<PrintQueue>();
  let mut initialized = queue.database.lock().await;
  if initialized.is_some() {
    return Ok(());
  }
  {
    let mut writer = database.writer().await.map_err(db_error)?;
    let tx = writer.transaction().map_err(db_error)?;
    install(&tx)?;
    recover(&tx)?;
    tx.commit().map_err(db_error)?;
  }
  *initialized = Some(database.clone());
  let app = app.clone();
  tauri::async_runtime::spawn(async move {
    loop {
      let result = process_one(&database).await;
      let queue = app.state::<PrintQueue>();
      match result {
        Ok(()) => {}
        Err(error) => {
          log::error!("{error}");
          match queue.worker_error.lock() {
            Ok(mut value) => *value = Some(error),
            Err(error) => log::error!("Receipt worker error lock failed: {error}"),
          }
        }
      }
      tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
  });
  Ok(())
}

async fn database(queue: &PrintQueue) -> Result<PowerSyncDatabase, String> {
  queue
    .database
    .lock()
    .await
    .clone()
    .ok_or_else(|| "Receipt storage is not initialized. Restart the desktop app.".into())
}

fn settings(connection: &Connection) -> Result<TerminalSettings, String> {
  let json: String = connection
    .query_row(
      "SELECT settings_json FROM receipt_terminal_settings WHERE id = 1",
      [],
      |row| row.get(0),
    )
    .map_err(db_error)?;
  serde_json::from_str(&json).map_err(db_error)
}

struct ClaimedJob {
  id: String,
  snapshot: String,
  is_copy: bool,
  copies: u32,
  attempt_id: i64,
  settings: TerminalSettings,
}

fn claim(connection: &mut Connection) -> Result<Option<ClaimedJob>, String> {
  let tx = connection.transaction().map_err(db_error)?;
  let row = tx
    .query_row(
      "SELECT j.id, r.snapshot_json, j.is_copy, j.copy_count
     FROM receipt_print_jobs j JOIN receipt_snapshots r ON r.sale_id = j.sale_id
     WHERE j.status = 'pending' ORDER BY j.created_at, j.id LIMIT 1",
      [],
      |row| {
        Ok((
          row.get::<_, String>(0)?,
          row.get::<_, String>(1)?,
          row.get::<_, bool>(2)?,
          row.get::<_, u32>(3)?,
        ))
      },
    )
    .optional()
    .map_err(db_error)?;
  let Some((id, snapshot, is_copy, copies)) = row else {
    return Ok(None);
  };
  let settings = settings(&tx)?;
  tx.execute(&format!(
    "UPDATE receipt_print_jobs SET status = 'sending', error = NULL, updated_at = {NOW} WHERE id = ?"
  ), [&id]).map_err(db_error)?;
  tx.execute(
    &format!(
      "INSERT INTO receipt_print_attempts (job_id, printer, status, created_at)
     VALUES (?, ?, 'sending', {NOW})"
    ),
    params![id, settings.printer],
  )
  .map_err(db_error)?;
  let attempt_id = tx.last_insert_rowid();
  tx.commit().map_err(db_error)?;
  Ok(Some(ClaimedJob {
    id,
    snapshot,
    is_copy,
    copies,
    attempt_id,
    settings,
  }))
}

// No cutter or vendor-specific commands until a verified device profile exists.
fn escpos(layout: &ReceiptLayout, copies: u32) -> Vec<u8> {
  let mut bytes = Vec::new();
  for _ in 0..copies {
    bytes.extend_from_slice(b"\x1b@");
    for line in &layout.lines {
      bytes.extend_from_slice(line.as_bytes());
      bytes.push(b'\n');
    }
    bytes.extend_from_slice(b"\n\n\n");
  }
  bytes
}

struct Delivery {
  status: &'static str,
  error: Option<String>,
  layout: Option<ReceiptLayout>,
  bytes: Option<Vec<u8>>,
}

fn deliver(job: &ClaimedJob) -> Delivery {
  let rendered = (|| {
    let mut snapshot: Snapshot = serde_json::from_str(&job.snapshot).map_err(db_error)?;
    if snapshot.version != 1 {
      return Err("Unsupported receipt snapshot version.".into());
    }
    snapshot.data.is_copy = job.is_copy;
    receipt::render(&snapshot.data, &snapshot.config)
  })();
  let layout = match rendered {
    Ok(layout) => layout,
    Err(error) => {
      return Delivery {
        status: "failed_not_sent",
        error: Some(error),
        layout: None,
        bytes: None,
      }
    }
  };
  let bytes = escpos(&layout, job.copies);
  let (status, error) = if job.settings.printer == "none" {
    (
      "failed_not_sent",
      Some("No printer selected. Sale is saved; select a printer and retry.".into()),
    )
  } else if !cfg!(debug_assertions) || job.settings.printer != "virtual" {
    (
      "failed_not_sent",
      Some("Selected printer is unavailable in this build.".into()),
    )
  } else {
    match job.settings.virtual_outcome.as_str() {
      "success" => ("virtual_output", None),
      "disconnected" => (
        "failed_not_sent",
        Some("Simulated printer disconnected; nothing sent.".into()),
      ),
      "write_failure" => (
        "failed_not_sent",
        Some("Simulated write failure before delivery; nothing sent.".into()),
      ),
      "uncertain" => (
        "uncertain",
        Some("Simulated connection loss during delivery. Output may already exist.".into()),
      ),
      "interrupted" => (
        "sending",
        Some("Simulated interruption. Restart to exercise recovery; do not retry yet.".into()),
      ),
      _ => (
        "failed_not_sent",
        Some("Invalid virtual printer outcome.".into()),
      ),
    }
  };
  Delivery {
    status,
    error,
    layout: Some(layout),
    bytes: Some(bytes),
  }
}

async fn process_one(db: &PowerSyncDatabase) -> Result<(), String> {
  let job = {
    let mut writer = db.writer().await.map_err(db_error)?;
    claim(&mut writer)?
  };
  let Some(job) = job else {
    return Ok(());
  };
  let delivery = deliver(&job);
  let mut writer = db.writer().await.map_err(db_error)?;
  finish(&mut writer, &job, delivery)
}

fn finish(connection: &mut Connection, job: &ClaimedJob, delivery: Delivery) -> Result<(), String> {
  let tx = connection.transaction().map_err(db_error)?;
  let layout = delivery
    .layout
    .as_ref()
    .map(serde_json::to_string)
    .transpose()
    .map_err(db_error)?;
  let bytes = delivery
    .bytes
    .as_ref()
    .map(serde_json::to_string)
    .transpose()
    .map_err(db_error)?;
  tx.execute(
    &format!(
      "UPDATE receipt_print_attempts SET status = ?, error = ?, layout_json = ?, escpos_json = ?,
       finished_at = CASE WHEN ? = 'sending' THEN NULL ELSE {NOW} END WHERE id = ?"
    ),
    params![
      delivery.status,
      delivery.error,
      layout,
      bytes,
      delivery.status,
      job.attempt_id
    ],
  )
  .map_err(db_error)?;
  tx.execute(
    &format!(
      "UPDATE receipt_print_jobs SET status = ?, error = ?, updated_at = {NOW} WHERE id = ?"
    ),
    params![delivery.status, delivery.error, job.id],
  )
  .map_err(db_error)?;
  tx.commit().map_err(db_error)
}

#[tauri::command]
pub async fn receipt_settings_get(
  queue: tauri::State<'_, PrintQueue>,
) -> Result<TerminalSettings, String> {
  let db = database(&queue).await?;
  let reader = db.reader().await.map_err(db_error)?;
  settings(&reader)
}

#[tauri::command]
pub async fn receipt_settings_save(
  queue: tauri::State<'_, PrintQueue>,
  settings: TerminalSettings,
) -> Result<(), String> {
  settings.validate()?;
  let json = serde_json::to_string(&settings).map_err(db_error)?;
  let db = database(&queue).await?;
  let writer = db.writer().await.map_err(db_error)?;
  writer
    .execute(
      "UPDATE receipt_terminal_settings SET settings_json = ? WHERE id = 1",
      [json],
    )
    .map_err(db_error)?;
  Ok(())
}

fn history(connection: &Connection, store_id: &str) -> Result<ReceiptHistory, String> {
  let receipts = connection
    .prepare(
      "SELECT sale_id, invoice_number, created_at FROM receipt_snapshots
     WHERE store_id = ? ORDER BY created_at DESC LIMIT 100",
    )
    .map_err(db_error)?
    .query_map([store_id], |row| {
      Ok(SavedReceipt {
        sale_id: row.get(0)?,
        invoice_number: row.get(1)?,
        created_at: row.get(2)?,
      })
    })
    .map_err(db_error)?
    .collect::<Result<Vec<_>, _>>()
    .map_err(db_error)?;
  let mut jobs = connection.prepare(
    "SELECT j.id, j.sale_id, r.invoice_number, j.is_copy, j.copy_count, j.status, j.error, j.created_at
     FROM receipt_print_jobs j JOIN receipt_snapshots r ON r.sale_id = j.sale_id
     WHERE j.store_id = ? ORDER BY j.created_at DESC, j.id DESC LIMIT 100"
  ).map_err(db_error)?.query_map([store_id], |row| Ok(PrintJob {
    id: row.get(0)?, sale_id: row.get(1)?, invoice_number: row.get(2)?, is_copy: row.get(3)?,
    copy_count: row.get(4)?, status: row.get(5)?, error: row.get(6)?, created_at: row.get(7)?,
    attempts: Vec::new(),
  })).map_err(db_error)?.collect::<Result<Vec<_>, _>>().map_err(db_error)?;
  for job in &mut jobs {
    let mut stmt = connection
      .prepare(
        "SELECT id, printer, status, error, layout_json, escpos_json, created_at, finished_at
       FROM receipt_print_attempts WHERE job_id = ? ORDER BY id",
      )
      .map_err(db_error)?;
    let mut rows = stmt.query([&job.id]).map_err(db_error)?;
    while let Some(row) = rows.next().map_err(db_error)? {
      let layout: Option<String> = row.get(4).map_err(db_error)?;
      let bytes: Option<String> = row.get(5).map_err(db_error)?;
      job.attempts.push(PrintAttempt {
        id: row.get(0).map_err(db_error)?,
        printer: row.get(1).map_err(db_error)?,
        status: row.get(2).map_err(db_error)?,
        error: row.get(3).map_err(db_error)?,
        layout: layout
          .map(|s| serde_json::from_str(&s))
          .transpose()
          .map_err(db_error)?,
        escpos: bytes
          .map(|s| serde_json::from_str(&s))
          .transpose()
          .map_err(db_error)?,
        created_at: row.get(6).map_err(db_error)?,
        finished_at: row.get(7).map_err(db_error)?,
      });
    }
  }
  Ok(ReceiptHistory {
    receipts,
    jobs,
    worker_error: None,
  })
}

#[tauri::command]
pub async fn receipt_history(
  queue: tauri::State<'_, PrintQueue>,
  store_id: String,
) -> Result<ReceiptHistory, String> {
  let db = database(&queue).await?;
  let mut reader = db.reader().await.map_err(db_error)?;
  let tx = reader.transaction().map_err(db_error)?;
  let mut history = history(&tx, &store_id)?;
  history.worker_error = queue.worker_error.lock().map_err(db_error)?.clone();
  tx.commit().map_err(db_error)?;
  Ok(history)
}

fn retry(
  connection: &Connection,
  store_id: &str,
  job_id: &str,
  confirmed: bool,
) -> Result<(), String> {
  let changed = connection
    .execute(
      &format!(
    "UPDATE receipt_print_jobs SET status = 'pending', error = NULL, updated_at = {NOW}
     WHERE id = ? AND store_id = ? AND (status = 'failed_not_sent' OR (status = 'uncertain' AND ?))"
  ),
      params![job_id, store_id, confirmed],
    )
    .map_err(db_error)?;
  if changed != 1 {
    return Err(
      "Job cannot be retried. Uncertain delivery requires confirmation; refresh its status.".into(),
    );
  }
  Ok(())
}

#[tauri::command]
pub async fn receipt_retry(
  queue: tauri::State<'_, PrintQueue>,
  store_id: String,
  job_id: String,
  confirmed: bool,
) -> Result<(), String> {
  let db = database(&queue).await?;
  let writer = db.writer().await.map_err(db_error)?;
  retry(&writer, &store_id, &job_id, confirmed)
}

fn reprint(connection: &Connection, store_id: &str, sale_id: &str) -> Result<(), String> {
  let changed = connection
    .execute(
      &format!(
        "INSERT INTO receipt_print_jobs
     SELECT lower(hex(randomblob(16))), sale_id, store_id, 1,
       json_extract(snapshot_json, '$.copyCount'), 'pending', NULL, {NOW}, {NOW}
     FROM receipt_snapshots WHERE sale_id = ? AND store_id = ?"
      ),
      params![sale_id, store_id],
    )
    .map_err(db_error)?;
  if changed != 1 {
    return Err("No original local receipt snapshot exists for this sale.".into());
  }
  Ok(())
}

#[tauri::command]
pub async fn receipt_reprint(
  queue: tauri::State<'_, PrintQueue>,
  store_id: String,
  sale_id: String,
) -> Result<(), String> {
  let db = database(&queue).await?;
  let writer = db.writer().await.map_err(db_error)?;
  reprint(&writer, &store_id, &sale_id)
}

#[cfg(test)]
mod tests {
  use super::*;
  use powersync::schema::{Column, Schema, Table};
  use serde_json::{json, Value};

  fn schema() -> Schema {
    let definitions = [
      ("stores", "name address ntn store_settings_id"),
      ("business_settings", "receipt_footer"),
      ("customers", "name phone_number ntn"),
      ("products", "barcode"),
      ("sales", "store_id invoice_number sold_at currency_code customer_id user_id sale_type description subtotal discount_amount taxable_amount tax_amount total_amount total_paid remaining status"),
      ("sale_items", "sale_id product_id product_name sku quantity unit_price tax_rate taxable_amount line_total date_created"),
      ("payments", "sale_id amount method reference_number description date_created"),
    ];
    Schema {
      tables: definitions
        .into_iter()
        .map(|(name, columns)| {
          Table::create(
            name,
            columns
              .split(' ')
              .map(|name| Column::text(name.to_string()))
              .collect(),
            |_| {},
          )
        })
        .collect(),
      ..Default::default()
    }
  }

  fn connection() -> Connection {
    powersync::env::PowerSyncEnvironment::powersync_auto_extension().unwrap();
    let connection = Connection::open_in_memory().unwrap();
    connection
      .execute_batch("BEGIN; SELECT powersync_init();")
      .unwrap();
    connection
      .query_row(
        "SELECT powersync_replace_schema(?)",
        [serde_json::to_string(&schema()).unwrap()],
        |_| Ok(()),
      )
      .unwrap();
    connection.execute_batch("COMMIT;").unwrap();
    install(&connection).unwrap();
    connection.execute_batch(
      "INSERT INTO stores (id, name, address, ntn, store_settings_id)
       VALUES ('store', 'Original Store', 'Main Street', '123', 'settings');
       INSERT INTO business_settings (id, receipt_footer) VALUES ('settings', 'Original footer');
       INSERT INTO products (id, barcode) VALUES ('tea', '036000291452');
       INSERT INTO customers (id, name, phone_number, ntn) VALUES ('customer','Alice','0123','456');"
    ).unwrap();
    connection
  }

  fn sale(connection: &Connection, status: &str) {
    connection
      .execute(
        "INSERT INTO sales (id, store_id, invoice_number, sold_at, currency_code, customer_id,
         user_id, sale_type, subtotal, discount_amount, taxable_amount, tax_amount,
         total_amount, total_paid, remaining, status)
       VALUES ('sale', 'store', 'INV-1', '2026-10-14T10:00:00Z', 'PKR', 'customer',
         'cashier', 'CREDIT', '188.25', '8.25', '180.00', '5.00', '185.00', '100.00', '85.00', ?)",
        [status],
      )
      .unwrap();
    connection
      .execute_batch(
        "INSERT INTO sale_items (id, sale_id, product_id, product_name, sku, quantity,
         unit_price, tax_rate, taxable_amount, line_total, date_created)
       VALUES ('item', 'sale', 'tea', 'Original Tea', 'TEA', '1.50', '125.50',
         '0.0266', '188.25', '193.25', '2026-10-14T10:00:00Z');
       INSERT INTO payments (id, sale_id, amount, method, date_created)
       VALUES ('payment', 'sale', '100.00', 'CASH', '2026-10-14T10:00:00Z');",
      )
      .unwrap();
  }

  fn commit(connection: &Connection) {
    connection
      .execute("INSERT INTO receipt_commits (sale_id) VALUES ('sale')", [])
      .unwrap();
  }

  fn configure(connection: &Connection, printer: &str, outcome: &str, auto: bool, copies: u32) {
    let mut settings = settings(connection).unwrap();
    settings.printer = printer.into();
    settings.virtual_outcome = outcome.into();
    settings.auto_print = auto;
    settings.copy_count = copies;
    settings.validate().unwrap();
    connection
      .execute(
        "UPDATE receipt_terminal_settings SET settings_json = ?",
        [serde_json::to_string(&settings).unwrap()],
      )
      .unwrap();
  }

  fn counts(connection: &Connection) -> (u32, u32, u32, u32) {
    connection
      .query_row(
        "SELECT (SELECT count(*) FROM sales), (SELECT count(*) FROM sale_items),
         (SELECT count(*) FROM payments), (SELECT count(*) FROM receipt_snapshots)",
        [],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
      )
      .unwrap()
  }

  #[test]
  fn actual_powersync_transaction_rolls_back_sale_snapshot_job_and_uploads_together() {
    let mut connection = connection();
    connection.execute("DELETE FROM ps_crud", []).unwrap();
    {
      let tx = connection.transaction().unwrap();
      sale(&tx, "COMPLETED");
      commit(&tx);
      assert_eq!(counts(&tx), (1, 1, 1, 1));
      assert_eq!(history(&tx, "store").unwrap().jobs.len(), 1);
      // Drop without commit represents any later transaction failure.
    }
    assert_eq!(counts(&connection), (0, 0, 0, 0));
    assert!(history(&connection, "store").unwrap().jobs.is_empty());
    let pending: u32 = connection
      .query_row("SELECT count(*) FROM ps_crud", [], |r| r.get(0))
      .unwrap();
    assert_eq!(pending, 0);
    let tx = connection.transaction().unwrap();
    sale(&tx, "COMPLETED");
    commit(&tx);
    tx.commit().unwrap();
    assert_eq!(counts(&connection), (1, 1, 1, 1));
    let uploads: Vec<String> = connection
      .prepare("SELECT data FROM ps_crud")
      .unwrap()
      .query_map([], |r| r.get(0))
      .unwrap()
      .collect::<Result<_, _>>()
      .unwrap();
    assert!(!uploads.is_empty());
    assert!(uploads.iter().all(|s| !s.contains("receipt_")));
    assert!(connection
      .execute("INSERT INTO receipt_commits (sale_id) VALUES ('sale')", [])
      .is_err());
  }

  #[test]
  fn drafts_are_rejected_and_disabled_auto_print_still_captures_snapshot() {
    let connection = connection();
    sale(&connection, "IN_PROGRESS");
    assert!(connection
      .execute("INSERT INTO receipt_commits (sale_id) VALUES ('sale')", [])
      .is_err());
    configure(&connection, "none", "success", false, 2);
    connection
      .execute("UPDATE sales SET status = 'COMPLETED'", [])
      .unwrap();
    commit(&connection);
    assert_eq!(counts(&connection), (1, 1, 1, 1));
    assert!(history(&connection, "store").unwrap().jobs.is_empty());
    reprint(&connection, "store", "sale").unwrap();
    let history = history(&connection, "store").unwrap();
    assert!(history.jobs[0].is_copy);
    assert_eq!(history.jobs[0].copy_count, 2);
  }

  #[test]
  fn missing_store_aborts_snapshot_and_initial_job() {
    let mut connection = connection();
    let tx = connection.transaction().unwrap();
    sale(&tx, "COMPLETED");
    tx.execute("DELETE FROM stores", []).unwrap();
    assert!(tx
      .execute("INSERT INTO receipt_commits (sale_id) VALUES ('sale')", [])
      .is_err());
    drop(tx);
    assert_eq!(counts(&connection), (0, 0, 0, 0));
  }

  #[cfg(debug_assertions)]
  #[test]
  fn virtual_output_and_copies_use_immutable_original_data_and_layout() {
    let mut connection = connection();
    configure(&connection, "virtual", "success", true, 2);
    sale(&connection, "COMPLETED");
    commit(&connection);
    let original: String = connection
      .query_row("SELECT snapshot_json FROM receipt_snapshots", [], |r| {
        r.get(0)
      })
      .unwrap();
    let snapshot: Value = serde_json::from_str(&original).unwrap();
    assert_eq!(snapshot["source"]["total"], "185.00");
    assert_eq!(snapshot["source"]["payments"][0]["method"], "CASH");
    assert_eq!(snapshot["data"]["items"][0]["barcode"], "036000291452");
    connection
      .execute_batch(
        "UPDATE stores SET name = 'Changed Store';
       UPDATE products SET barcode = '999';
       UPDATE customers SET name = 'Changed Customer';
       UPDATE business_settings SET receipt_footer = 'Changed footer';",
      )
      .unwrap();
    let mut changed = settings(&connection).unwrap();
    changed.config = serde_json::from_value(json!({
      "version":1, "paperProfile":"80mm", "header":"New header", "footer":"New footer",
      "showSku":true, "showBarcode":true, "showCustomer":false
    }))
    .unwrap();
    connection
      .execute(
        "UPDATE receipt_terminal_settings SET settings_json = ?",
        [serde_json::to_string(&changed).unwrap()],
      )
      .unwrap();
    assert!(connection
      .execute("UPDATE receipt_snapshots SET snapshot_json = '{}'", [])
      .is_err());
    assert!(connection
      .execute("DELETE FROM receipt_snapshots", [])
      .is_err());
    let job = claim(&mut connection).unwrap().unwrap();
    finish(&mut connection, &job, deliver(&job)).unwrap();
    let completed = history(&connection, "store").unwrap();
    assert_eq!(completed.jobs[0].status, "virtual_output");
    let output = &completed.jobs[0].attempts[0];
    let text = output.layout.as_ref().unwrap().lines.join("\n");
    for value in [
      "Original Store",
      "Original footer",
      "Original Tea",
      "Alice",
      "1.5 x 125.50",
      "PKR 185.00",
      "PKR 85.00",
    ] {
      assert!(text.contains(value), "{value}: {text}");
    }
    assert!(!text.contains("Changed"));
    let bytes = output.escpos.as_ref().unwrap();
    assert_eq!(bytes.iter().filter(|b| **b == 27).count(), 2);
    assert!(!text.contains("COPY"));
    assert_eq!(output.layout.as_ref().unwrap().paper_width_mm, 58);
    reprint(&connection, "store", "sale").unwrap();
    let copy = claim(&mut connection).unwrap().unwrap();
    assert_eq!(copy.settings.printer, "virtual");
    let output = deliver(&copy);
    assert!(output
      .layout
      .as_ref()
      .unwrap()
      .lines
      .contains(&"COPY".into()));
    assert_eq!(counts(&connection), (1, 1, 1, 1));
    assert!(history(&connection, "another-store")
      .unwrap()
      .jobs
      .is_empty());
    assert!(reprint(&connection, "another-store", "sale").is_err());
  }

  #[cfg(debug_assertions)]
  #[test]
  fn failures_require_manual_retry_and_preserve_attempt_history() {
    for outcome in ["disconnected", "write_failure", "uncertain"] {
      let mut connection = connection();
      configure(&connection, "virtual", outcome, true, 1);
      sale(&connection, "COMPLETED");
      commit(&connection);
      let job = claim(&mut connection).unwrap().unwrap();
      finish(&mut connection, &job, deliver(&job)).unwrap();
      assert!(claim(&mut connection).unwrap().is_none());
      let uncertain = outcome == "uncertain";
      assert_eq!(
        history(&connection, "store").unwrap().jobs[0].status,
        if uncertain {
          "uncertain"
        } else {
          "failed_not_sent"
        }
      );
      assert!(retry(&connection, "another-store", &job.id, true).is_err());
      if uncertain {
        assert!(retry(&connection, "store", &job.id, false).is_err());
      }
      retry(&connection, "store", &job.id, uncertain).unwrap();
      assert!(retry(&connection, "store", &job.id, true).is_err());
      configure(&connection, "virtual", "success", true, 1);
      let retry_job = claim(&mut connection).unwrap().unwrap();
      finish(&mut connection, &retry_job, deliver(&retry_job)).unwrap();
      let history = history(&connection, "store").unwrap();
      assert_eq!(history.jobs[0].attempts.len(), 2);
      assert_eq!(history.jobs[0].status, "virtual_output");
      assert!(retry(&connection, "store", &job.id, true).is_err());
      assert_eq!(counts(&connection), (1, 1, 1, 1));
    }
  }

  #[test]
  fn no_printer_is_explicitly_not_sent_without_simulator_fallback() {
    let mut connection = connection();
    sale(&connection, "COMPLETED");
    commit(&connection);
    let job = claim(&mut connection).unwrap().unwrap();
    let output = deliver(&job);
    assert_eq!(output.status, "failed_not_sent");
    assert!(output
      .error
      .as_ref()
      .unwrap()
      .contains("No printer selected"));
    finish(&mut connection, &job, output).unwrap();
    assert!(claim(&mut connection).unwrap().is_none());
  }

  #[test]
  fn interrupted_delivery_is_never_automatically_retried_after_recovery() {
    let mut connection = connection();
    sale(&connection, "COMPLETED");
    commit(&connection);
    let job = claim(&mut connection).unwrap().unwrap();
    assert!(retry(&connection, "store", &job.id, true).is_err());
    recover(&connection).unwrap();
    recover(&connection).unwrap();
    assert!(claim(&mut connection).unwrap().is_none());
    let history = history(&connection, "store").unwrap();
    assert_eq!(history.jobs[0].status, "uncertain");
    assert_eq!(history.jobs[0].attempts[0].status, "uncertain");
    assert!(retry(&connection, "store", &job.id, false).is_err());
    retry(&connection, "store", &job.id, true).unwrap();
    assert!(claim(&mut connection).unwrap().is_some());
  }

  #[test]
  fn malformed_print_data_does_not_undo_the_sale() {
    let mut connection = connection();
    sale(&connection, "COMPLETED");
    connection
      .execute("UPDATE sale_items SET product_name = ?", ["\u{0627}"])
      .unwrap();
    commit(&connection);
    let job = claim(&mut connection).unwrap().unwrap();
    finish(&mut connection, &job, deliver(&job)).unwrap();
    assert_eq!(
      history(&connection, "store").unwrap().jobs[0].status,
      "failed_not_sent"
    );
    assert_eq!(counts(&connection), (1, 1, 1, 1));
  }

  #[test]
  fn settings_validate_versions_text_copy_count_and_device_selection() {
    let connection = connection();
    let mut config = settings(&connection).unwrap();
    config.validate().unwrap();
    config.copy_count = 0;
    assert!(config.validate().is_err());
    config.copy_count = 6;
    assert!(config.validate().is_err());
    config.copy_count = 1;
    config.printer = "usb".into();
    assert!(config.validate().is_err());
    config.printer = "none".into();
    config.virtual_outcome = "invalid".into();
    assert!(config.validate().is_err());
    config.virtual_outcome = "success".into();
    #[cfg(not(debug_assertions))]
    {
      config.printer = "virtual".into();
      assert!(config.validate().is_err());
    }
  }

  #[test]
  fn persisted_jobs_settings_and_attempts_survive_disk_reopen() {
    let directory = tempfile::tempdir().unwrap();
    let file = directory.path().join("receipts.sqlite");
    let mut original = connection();
    configure(&original, "none", "success", true, 3);
    sale(&original, "COMPLETED");
    commit(&original);
    let job = claim(&mut original).unwrap().unwrap();
    original
      .execute("VACUUM INTO ?", [file.to_str().unwrap()])
      .unwrap();
    drop(original);
    let reopened = Connection::open(file).unwrap();
    install(&reopened).unwrap();
    recover(&reopened).unwrap();
    let persisted = history(&reopened, "store").unwrap();
    assert_eq!(persisted.receipts[0].invoice_number, "INV-1");
    assert_eq!(persisted.jobs[0].id, job.id);
    assert_eq!(persisted.jobs[0].status, "uncertain");
    assert_eq!(persisted.jobs[0].attempts.len(), 1);
    assert_eq!(settings(&reopened).unwrap().copy_count, 3);
  }

  #[test]
  fn native_worker_consumes_committed_jobs_without_repeating_the_sale() {
    use powersync::{ConnectionPool, env::PowerSyncEnvironment};

    let connection = connection();
    sale(&connection, "COMPLETED");
    commit(&connection);
    let db = PowerSyncDatabase::new(
      PowerSyncEnvironment::custom(
        reqwest::Client::new(),
        ConnectionPool::single_connection(connection),
        PowerSyncEnvironment::tokio_timer(),
      ),
      schema(),
    );
    tauri::async_runtime::block_on(async {
      process_one(&db).await.unwrap();
      process_one(&db).await.unwrap();
      let reader = db.reader().await.unwrap();
      let result = history(&reader, "store").unwrap();
      assert_eq!(result.jobs[0].status, "failed_not_sent");
      assert_eq!(result.jobs[0].attempts.len(), 1);
      assert_eq!(counts(&reader), (1, 1, 1, 1));
    });
  }

  #[test]
  fn native_ipc_returns_saved_history_and_enforces_retry_confirmation() {
    use powersync::{env::PowerSyncEnvironment, ConnectionPool};
    use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY};

    let mut connection = connection();
    sale(&connection, "COMPLETED");
    commit(&connection);
    let job = claim(&mut connection).unwrap().unwrap();
    recover(&connection).unwrap();
    let db = PowerSyncDatabase::new(
      PowerSyncEnvironment::custom(
        reqwest::Client::new(),
        ConnectionPool::single_connection(connection),
        PowerSyncEnvironment::tokio_timer(),
      ),
      schema(),
    );
    let app = mock_builder()
      .manage(PrintQueue {
        database: AsyncMutex::new(Some(db)),
        worker_error: Mutex::new(None),
      })
      .invoke_handler(tauri::generate_handler![
        receipt_settings_get,
        receipt_settings_save,
        receipt_history,
        receipt_retry,
        receipt_reprint
      ])
      .build(mock_context(noop_assets()))
      .unwrap();
    let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
      .build()
      .unwrap();
    let invoke = |command: &str, args: Value| {
      get_ipc_response(
        &window,
        tauri::webview::InvokeRequest {
          cmd: command.into(),
          callback: tauri::ipc::CallbackFn(0),
          error: tauri::ipc::CallbackFn(1),
          url: "tauri://localhost".parse().unwrap(),
          body: tauri::ipc::InvokeBody::Json(args),
          headers: Default::default(),
          invoke_key: INVOKE_KEY.into(),
        },
      )
    };
    let history = invoke("receipt_history", json!({"storeId":"store"}))
      .unwrap()
      .deserialize::<Value>()
      .unwrap();
    assert_eq!(history["jobs"][0]["status"], "uncertain");
    assert_eq!(history["jobs"][0]["attempts"][0]["status"], "uncertain");
    assert!(invoke(
      "receipt_retry",
      json!({
        "storeId":"store", "jobId":job.id, "confirmed":false
      })
    )
    .is_err());
    assert!(invoke(
      "receipt_retry",
      json!({
        "storeId":"store", "jobId":job.id, "confirmed":true
      })
    )
    .is_ok());
    assert!(invoke(
      "receipt_reprint",
      json!({"storeId":"store","saleId":"sale"})
    )
    .is_ok());
    let settings = invoke("receipt_settings_get", json!({}))
      .unwrap()
      .deserialize::<Value>()
      .unwrap();
    assert_eq!(settings["autoPrint"], true);
    let mut invalid = settings;
    invalid["copyCount"] = json!(0);
    assert!(invoke("receipt_settings_save", json!({"settings":invalid})).is_err());
    let history = invoke("receipt_history", json!({"storeId":"store"}))
      .unwrap()
      .deserialize::<Value>()
      .unwrap();
    assert_eq!(history["receipts"].as_array().unwrap().len(), 1);
    assert_eq!(history["jobs"].as_array().unwrap().len(), 2);
  }
}
