-- Removes the dev seed data (seeded products by SKU, and the seed tax categories).
-- Tax categories already used by other products are kept.
BEGIN;

CREATE TEMP TABLE seeded AS
SELECT id FROM products
WHERE sku ~ '^(TEA|GRC|OIL|DRY|BEV|SNK|HOM|SPC|VEG|OLD|SRV)-\d{3}$' AND barcode LIKE '8888%';

DELETE FROM stock_movements WHERE product_id IN (SELECT id FROM seeded);
DELETE FROM product_tax_categories WHERE product_id IN (SELECT id FROM seeded);
DELETE FROM products WHERE id IN (SELECT id FROM seeded);

DELETE FROM tax_categories tc
WHERE tc.code IN ('GST18', 'GST10', 'FURTHER3', 'ZERO', 'EXEMPT')
  AND NOT EXISTS (SELECT 1 FROM product_tax_categories p WHERE p.tax_category_id = tc.id);

COMMIT;
