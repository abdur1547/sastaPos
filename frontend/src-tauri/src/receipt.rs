use serde::{Deserialize, Serialize};

const MAX_AMOUNT: u64 = 99_999_999_999_999;

#[derive(Clone, Copy, Deserialize)]
pub enum PaperProfile {
  #[serde(rename = "58mm")]
  Narrow,
  #[serde(rename = "80mm")]
  Wide,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReceiptConfig {
  version: u32,
  paper_profile: PaperProfile,
  header: String,
  footer: String,
  show_sku: bool,
  show_barcode: bool,
  show_customer: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReceiptItem {
  name: String,
  sku: Option<String>,
  barcode: Option<String>,
  quantity: u32,
  unit_price_minor: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReceiptData {
  invoice_number: String,
  issued_at: String,
  currency: String,
  customer: Option<String>,
  items: Vec<ReceiptItem>,
  discount_minor: u64,
  tax_minor: u64,
  paid_minor: u64,
  is_copy: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptLayout {
  version: u32,
  paper_width_mm: u32,
  columns: usize,
  lines: Vec<String>,
}

fn validate_text(value: &str, label: &str, max: usize, multiline: bool) -> Result<(), String> {
  if value.len() > max
    || !value
      .bytes()
      .all(|byte| (b' '..=b'~').contains(&byte) || (multiline && byte == b'\n'))
  {
    return Err(format!(
      "{label} must use printable ASCII{} and contain at most {max} bytes.",
      if multiline { " or line breaks" } else { "" }
    ));
  }
  Ok(())
}

fn required_text(value: &str, label: &str, max: usize) -> Result<(), String> {
  validate_text(value, label, max, false)?;
  if value.trim().is_empty() {
    return Err(format!("{label} must not be empty."));
  }
  Ok(())
}

fn amount(value: u64) -> String {
  format!("{}.{:02}", value / 100, value % 100)
}

fn wrap(value: &str, columns: usize) -> Vec<String> {
  let mut lines = Vec::new();
  for paragraph in value.split('\n') {
    let mut line = String::new();
    for word in paragraph.split_ascii_whitespace() {
      if !line.is_empty() && line.len() + 1 + word.len() > columns {
        lines.push(std::mem::take(&mut line));
      }
      let mut rest = word;
      while rest.len() > columns {
        lines.push(rest[..columns].to_string());
        rest = &rest[columns..];
      }
      if !line.is_empty() {
        line.push(' ');
      }
      line.push_str(rest);
    }
    if !line.is_empty() || paragraph.trim().is_empty() {
      lines.push(line);
    }
  }
  lines
}

fn pair(lines: &mut Vec<String>, left: &str, right: &str, columns: usize) {
  if left.len() + right.len() < columns {
    lines.push(format!(
      "{left}{}{right}",
      " ".repeat(columns - left.len() - right.len())
    ));
  } else {
    lines.extend(wrap(left, columns));
    for line in wrap(right, columns) {
      lines.push(format!("{line:>columns$}"));
    }
  }
}

pub fn render(data: &ReceiptData, config: &ReceiptConfig) -> Result<ReceiptLayout, String> {
  if config.version != 1 {
    return Err("Unsupported receipt configuration version.".into());
  }
  validate_text(&config.header, "Header", 1000, true)?;
  validate_text(&config.footer, "Footer", 1000, true)?;
  required_text(&data.invoice_number, "Invoice number", 100)?;
  required_text(&data.issued_at, "Issue date", 100)?;
  if data.currency.len() != 3 || !data.currency.bytes().all(|byte| byte.is_ascii_uppercase()) {
    return Err("Currency must be a three-letter uppercase code.".into());
  }
  if let Some(customer) = &data.customer {
    required_text(customer, "Customer", 255)?;
  }
  if data.items.is_empty() || data.items.len() > 200 {
    return Err("Receipt must contain between 1 and 200 items.".into());
  }
  let mut subtotal = 0_u64;
  for item in &data.items {
    required_text(&item.name, "Product name", 255)?;
    for (value, label) in [(&item.sku, "SKU"), (&item.barcode, "Barcode")] {
      if let Some(value) = value {
        validate_text(value, label, 255, false)?;
      }
    }
    if item.quantity == 0 || item.quantity > 1_000_000 || item.unit_price_minor > MAX_AMOUNT {
      return Err("Item quantity or price is outside the supported range.".into());
    }
    subtotal = item
      .unit_price_minor
      .checked_mul(u64::from(item.quantity))
      .and_then(|line| subtotal.checked_add(line))
      .filter(|total| *total <= MAX_AMOUNT)
      .ok_or("Receipt subtotal exceeds the supported range.")?;
  }
  if data.discount_minor > subtotal || data.tax_minor > MAX_AMOUNT || data.paid_minor > MAX_AMOUNT {
    return Err("Discount, tax, or payment is outside the supported range.".into());
  }
  let total = (subtotal - data.discount_minor)
    .checked_add(data.tax_minor)
    .filter(|total| *total <= MAX_AMOUNT)
    .ok_or("Receipt total exceeds the supported range.")?;
  // These are explicit text/font profiles, not a claim about every physical printer.
  let (paper_width_mm, columns) = match config.paper_profile {
    PaperProfile::Narrow => (58, 32),
    PaperProfile::Wide => (80, 48),
  };
  let mut lines = Vec::new();
  if !config.header.is_empty() {
    for line in wrap(&config.header, columns) {
      lines.push(format!("{}{line}", " ".repeat((columns - line.len()) / 2)));
    }
  }
  if data.is_copy {
    lines.push("COPY".into());
  }
  lines.extend(wrap(&format!("Invoice: {}", data.invoice_number), columns));
  lines.extend(wrap(&format!("Date: {}", data.issued_at), columns));
  if config.show_customer {
    if let Some(customer) = &data.customer {
      lines.extend(wrap(&format!("Customer: {customer}"), columns));
    }
  }
  let separator = "-".repeat(columns);
  lines.push(separator.clone());
  for item in &data.items {
    lines.extend(wrap(&item.name, columns));
    if config.show_sku {
      if let Some(sku) = &item.sku {
        lines.extend(wrap(&format!("SKU: {sku}"), columns));
      }
    }
    if config.show_barcode {
      if let Some(barcode) = &item.barcode {
        lines.extend(wrap(&format!("Barcode: {barcode}"), columns));
      }
    }
    pair(
      &mut lines,
      &format!("{} x {}", item.quantity, amount(item.unit_price_minor)),
      &amount(item.unit_price_minor * u64::from(item.quantity)),
      columns,
    );
  }
  lines.push(separator);
  for (label, value) in [
    ("Subtotal", subtotal),
    ("Discount", data.discount_minor),
    ("Tax", data.tax_minor),
    ("TOTAL", total),
    ("Paid", data.paid_minor),
  ] {
    pair(
      &mut lines,
      label,
      &format!("{} {}", data.currency, amount(value)),
      columns,
    );
  }
  let (label, balance) = if data.paid_minor > total {
    ("Change", data.paid_minor - total)
  } else {
    ("Outstanding", total - data.paid_minor)
  };
  pair(
    &mut lines,
    label,
    &format!("{} {}", data.currency, amount(balance)),
    columns,
  );
  if !config.footer.is_empty() {
    lines.push(String::new());
    lines.extend(wrap(&config.footer, columns));
  }
  Ok(ReceiptLayout {
    version: 1,
    paper_width_mm,
    columns,
    lines,
  })
}

#[cfg(debug_assertions)]
#[tauri::command]
pub fn receipt_preview(data: ReceiptData, config: ReceiptConfig) -> Result<ReceiptLayout, String> {
  render(&data, &config)
}

#[cfg(test)]
mod tests {
  use super::*;

  fn fixture() -> (ReceiptData, ReceiptConfig) {
    (
      ReceiptData {
        invoice_number: "SAMPLE-001".into(),
        issued_at: "2026-10-14 15:00".into(),
        currency: "PKR".into(),
        customer: Some("Sample customer".into()),
        items: vec![ReceiptItem {
          name: "A very long product name that must wrap across receipt lines".into(),
          sku: Some("SKU-1".into()),
          barcode: Some("036000291452".into()),
          quantity: 2,
          unit_price_minor: 12550,
        }],
        discount_minor: 1000,
        tax_minor: 500,
        paid_minor: 10000,
        is_copy: false,
      },
      ReceiptConfig {
        version: 1,
        paper_profile: PaperProfile::Narrow,
        header: "Sample Store".into(),
        footer: "Thank you\nVisit again".into(),
        show_sku: false,
        show_barcode: true,
        show_customer: false,
      },
    )
  }

  #[test]
  fn profiles_wrap_and_format_totals_without_float_rounding() {
    let (data, mut config) = fixture();
    for (profile, width, columns) in [(PaperProfile::Narrow, 58, 32), (PaperProfile::Wide, 80, 48)]
    {
      config.paper_profile = profile;
      let layout = render(&data, &config).unwrap();
      assert_eq!((layout.paper_width_mm, layout.columns), (width, columns));
      assert!(layout.lines.iter().all(|line| line.len() <= columns));
      let text = layout.lines.join("\n");
      assert!(text.contains("036000291452"));
      assert!(!text.contains("SKU-1"));
      assert!(!text.contains("Sample customer"));
      assert!(text.contains("PKR 246.00"));
      assert!(text.contains("PKR 146.00"));
      assert!(text.contains("2 x 125.50"));
    }
  }

  #[test]
  fn optional_fields_copy_and_change() {
    let (mut data, mut config) = fixture();
    config.show_sku = true;
    config.show_customer = true;
    config.show_barcode = false;
    data.is_copy = true;
    data.paid_minor = 30000;
    let text = render(&data, &config).unwrap().lines.join("\n");
    for value in ["COPY", "SKU-1", "Sample customer", "Change", "PKR 54.00"] {
      assert!(text.contains(value));
    }
    assert!(!text.contains("036000291452"));
  }

  #[test]
  fn splits_unbroken_names_and_large_amounts_within_exact_width() {
    let (mut data, config) = fixture();
    data.items[0].name = "A".repeat(255);
    data.items[0].unit_price_minor = MAX_AMOUNT / 2;
    let layout = render(&data, &config).unwrap();
    assert!(layout.lines.iter().all(|line| line.len() <= 32));
    assert!(layout.lines.join("\n").contains("999999999999.98"));
  }

  #[test]
  fn rejects_invalid_text_versions_and_amounts() {
    let (mut data, mut config) = fixture();
    config.version = 2;
    assert!(render(&data, &config).is_err());
    config.version = 1;
    config.header = "Non ASCII: \u{0627}".into();
    assert!(render(&data, &config).is_err());
    config.header.clear();
    data.items[0].quantity = 0;
    assert!(render(&data, &config).is_err());
    data.items[0].quantity = 2;
    data.items[0].unit_price_minor = MAX_AMOUNT;
    assert!(render(&data, &config).is_err());
    data.items[0].unit_price_minor = 100;
    assert!(render(&data, &config).is_err()); // Discount exceeds subtotal.
    data.discount_minor = 0;
    data.items[0].name = "control\tcharacter".into();
    assert!(render(&data, &config).is_err());
  }

  #[cfg(debug_assertions)]
  #[test]
  fn native_preview_command_serializes_layout_and_rejects_invalid_config() {
    use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY};

    let app = mock_builder()
      .invoke_handler(tauri::generate_handler![receipt_preview])
      .build(mock_context(noop_assets()))
      .unwrap();
    let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
      .build()
      .unwrap();
    let invoke = |args: serde_json::Value| {
      get_ipc_response(
        &window,
        tauri::webview::InvokeRequest {
          cmd: "receipt_preview".into(),
          callback: tauri::ipc::CallbackFn(0),
          error: tauri::ipc::CallbackFn(1),
          url: "tauri://localhost".parse().unwrap(),
          body: tauri::ipc::InvokeBody::Json(args),
          headers: Default::default(),
          invoke_key: INVOKE_KEY.into(),
        },
      )
    };
    let mut args = serde_json::json!({
      "data": {
        "invoiceNumber": "SAMPLE-001", "issuedAt": "2026-10-14", "currency": "PKR",
        "customer": null, "items": [{
          "name": "Tea", "sku": null, "barcode": "001", "quantity": 2, "unitPriceMinor": 12550
        }],
        "discountMinor": 1000, "taxMinor": 500, "paidMinor": 10000, "isCopy": false
      },
      "config": {
        "version": 1, "paperProfile": "80mm", "header": "Store", "footer": "",
        "showSku": false, "showBarcode": true, "showCustomer": false
      }
    });
    let layout = invoke(args.clone())
      .unwrap()
      .deserialize::<serde_json::Value>()
      .unwrap();
    assert_eq!(layout["paperWidthMm"], 80);
    assert_eq!(layout["columns"], 48);
    assert!(layout["lines"]
      .as_array()
      .unwrap()
      .iter()
      .any(|line| { line.as_str().unwrap().contains("PKR 246.00") }));
    args["config"]["version"] = serde_json::json!(2);
    assert!(invoke(args).is_err());
  }
}
