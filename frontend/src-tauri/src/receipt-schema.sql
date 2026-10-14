CREATE TABLE IF NOT EXISTS receipt_terminal_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  settings_json TEXT NOT NULL CHECK (json_valid(settings_json))
);
INSERT OR IGNORE INTO receipt_terminal_settings VALUES (1,
  '{"config":{"version":1,"paperProfile":"58mm","header":"","footer":"","showSku":false,"showBarcode":false,"showCustomer":true},"autoPrint":true,"copyCount":1,"printer":"none","virtualOutcome":"success"}');

CREATE TABLE IF NOT EXISTS receipt_snapshots (
  sale_id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  created_at TEXT NOT NULL,
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json))
);
CREATE TRIGGER IF NOT EXISTS receipt_snapshots_no_update BEFORE UPDATE ON receipt_snapshots
BEGIN SELECT RAISE(ABORT, 'Receipt snapshots are immutable.'); END;
CREATE TRIGGER IF NOT EXISTS receipt_snapshots_no_delete BEFORE DELETE ON receipt_snapshots
BEGIN SELECT RAISE(ABORT, 'Receipt snapshots are immutable.'); END;

CREATE TABLE IF NOT EXISTS receipt_print_jobs (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES receipt_snapshots(sale_id),
  store_id TEXT NOT NULL,
  is_copy INTEGER NOT NULL CHECK (is_copy IN (0, 1)),
  copy_count INTEGER NOT NULL CHECK (copy_count BETWEEN 1 AND 5),
  status TEXT NOT NULL CHECK (status IN ('pending','sending','virtual_output','failed_not_sent','uncertain')),
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS receipt_jobs_store ON receipt_print_jobs(store_id, created_at);
CREATE TABLE IF NOT EXISTS receipt_print_attempts (
  id INTEGER PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES receipt_print_jobs(id),
  printer TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  layout_json TEXT,
  escpos_json TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE VIEW IF NOT EXISTS receipt_commits AS SELECT sale_id FROM receipt_snapshots WHERE 0;
CREATE TRIGGER IF NOT EXISTS receipt_commit INSTEAD OF INSERT ON receipt_commits
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM sales WHERE id = NEW.sale_id AND status = 'COMPLETED'
  ) THEN RAISE(ABORT, 'Only completed sales can have receipt snapshots.') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM sale_items WHERE sale_id = NEW.sale_id
  ) THEN RAISE(ABORT, 'A receipt requires sale items.') END;
  INSERT INTO receipt_snapshots (sale_id, store_id, invoice_number, created_at, snapshot_json)
  SELECT s.id, s.store_id, s.invoice_number, s.sold_at,
    json_object(
      'version', 1,
      'data', json_object(
        'invoiceNumber', s.invoice_number, 'issuedAt', s.sold_at,
        'currency', s.currency_code, 'customer', c.name,
        'items', json((SELECT json_group_array(json_object(
          'name', i.product_name, 'sku', i.sku, 'barcode', p.barcode,
          'quantity', i.quantity, 'unitPriceMinor', replace(i.unit_price, '.', '')
        )) FROM (SELECT * FROM sale_items WHERE sale_id = s.id ORDER BY date_created, id) i
          LEFT JOIN products p ON p.id = i.product_id)),
        'discountMinor', replace(s.discount_amount, '.', ''),
        'taxMinor', replace(s.tax_amount, '.', ''),
        'paidMinor', replace(s.total_paid, '.', ''), 'isCopy', json('false')
      ),
      'config', json(json_set(json_extract(t.settings_json, '$.config'),
        '$.header', CASE WHEN json_extract(t.settings_json, '$.config.header') = ''
          THEN st.name || CASE WHEN coalesce(st.address, '') = '' THEN '' ELSE char(10) || st.address END
          ELSE json_extract(t.settings_json, '$.config.header') END,
        '$.footer', CASE WHEN json_extract(t.settings_json, '$.config.footer') = ''
          THEN coalesce(bs.receipt_footer, '') ELSE json_extract(t.settings_json, '$.config.footer') END)),
      'source', json_object(
        'store', json_object('id', st.id, 'name', st.name, 'address', st.address, 'ntn', st.ntn),
        'customer', json_object('id', c.id, 'name', c.name, 'phone', c.phone_number, 'ntn', c.ntn),
        'userId', s.user_id, 'saleType', s.sale_type, 'description', s.description,
        'subtotal', s.subtotal, 'discount', s.discount_amount, 'taxable', s.taxable_amount,
        'tax', s.tax_amount, 'total', s.total_amount, 'paid', s.total_paid, 'remaining', s.remaining,
        'items', json((SELECT json_group_array(json_object(
          'id', id, 'productId', product_id, 'name', product_name, 'sku', sku,
          'quantity', quantity, 'unitPrice', unit_price, 'taxRate', tax_rate,
          'taxable', taxable_amount, 'lineTotal', line_total
        )) FROM (SELECT * FROM sale_items WHERE sale_id = s.id ORDER BY date_created, id))),
        'payments', json((SELECT json_group_array(json_object(
          'id', id, 'amount', amount, 'method', method, 'reference', reference_number,
          'description', description
        )) FROM (SELECT * FROM payments WHERE sale_id = s.id ORDER BY date_created, id)))
      ),
      'copyCount', json_extract(t.settings_json, '$.copyCount')
    )
  FROM sales s
    JOIN stores st ON st.id = s.store_id
    LEFT JOIN business_settings bs ON bs.id = st.store_settings_id
    LEFT JOIN customers c ON c.id = s.customer_id
    JOIN receipt_terminal_settings t ON t.id = 1
  WHERE s.id = NEW.sale_id;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM receipt_snapshots WHERE sale_id = NEW.sale_id)
    THEN RAISE(ABORT, 'Store data is required for a receipt snapshot.') END;
  INSERT INTO receipt_print_jobs
  SELECT lower(hex(randomblob(16))), r.sale_id, r.store_id, 0,
    json_extract(r.snapshot_json, '$.copyCount'), 'pending', NULL, r.created_at, r.created_at
  FROM receipt_snapshots r JOIN receipt_terminal_settings t ON t.id = 1
  WHERE r.sale_id = NEW.sale_id AND json_extract(t.settings_json, '$.autoPrint') = 1;
END;
