-- Dev seed: 50 grocery/general-store products for the FIRST store (oldest by date_created).
-- Override with:  psql -v store_id="'<uuid>'" -f 02_products.sql
-- Requires 01_tax_categories.sql and the units of measure from migration V5. Idempotent
-- (products are skipped when the pct_code / sku / barcode already exists in the store).
\if :{?store_id}
\else
  \set store_id 'NULL'
\endif

BEGIN;

CREATE TEMP TABLE seed_products (
    name text, sku text, barcode text, pct_code text, description text,
    unit_price numeric(18,2), stock numeric(18,2), status text, unit_code text, tax_code text
) ON COMMIT DROP;

INSERT INTO seed_products VALUES
 ('Tapal Danedar Tea 190g',      'TEA-001', '8888001000011', '0902.3000', 'Black tea leaves, 190g pack',        420.00, 48, 'ACTIVE', 'pack', 'GST18'),
 ('Lipton Yellow Label Tea 95g', 'TEA-002', '8888001000028', '0902.3001', 'Black tea, 95g pack',                 245.00, 3,  'ACTIVE', 'pack', 'GST18'),
 ('Vital Tea 430g',              'TEA-003', '8888001000035', '0902.4000', 'Black tea, 430g pack',                 780.00, 22, 'ACTIVE', 'pack', 'GST18'),
 ('Sugar (loose)',               'GRC-001', '8888002000010', '1701.9990', 'Refined white sugar',                  165.00, 250.50, 'ACTIVE', 'kg', 'ZERO'),
 ('Basmati Rice Super Kernel',   'GRC-002', '8888002000027', '1006.3090', 'Long grain basmati rice',              390.00, 180.00, 'ACTIVE', 'kg', 'ZERO'),
 ('Atta (Wheat Flour) 10kg',     'GRC-003', '8888002000034', '1101.0000', '10kg wheat flour bag',                1450.00, 35, 'ACTIVE', 'bag', 'ZERO'),
 ('Gram Flour (Besan) 1kg',      'GRC-004', '8888002000041', '1106.1000', 'Chickpea flour',                       320.00, 4,  'ACTIVE', 'pack', 'ZERO'),
 ('Red Lentils (Masoor Daal)',   'GRC-005', '8888002000058', '0713.4000', 'Split red lentils',                    310.00, 60.25, 'ACTIVE', 'kg', 'ZERO'),
 ('Chickpeas (Kabuli Chana)',    'GRC-006', '8888002000065', '0713.2000', 'White chickpeas',                      340.00, 42.00, 'ACTIVE', 'kg', 'ZERO'),
 ('Iodized Salt 800g',           'GRC-007', '8888002000072', '2501.0010', 'Table salt, 800g',                      70.00, 90, 'ACTIVE', 'pack', 'GST18'),
 ('Dalda Cooking Oil 1L',        'OIL-001', '8888003000019', '1511.9000', 'Cooking oil, 1 litre pouch',           620.00, 75, 'ACTIVE', 'pkt', 'GST18'),
 ('Habib Banaspati Ghee 1kg',    'OIL-002', '8888003000026', '1516.2000', 'Vegetable ghee, 1kg',                  590.00, 0,  'ACTIVE', 'pkt', 'GST18'),
 ('Mustard Oil 500ml',           'OIL-003', '8888003000033', '1514.1100', 'Mustard oil bottle',                   410.00, 12, 'ACTIVE', 'btl', 'GST18'),
 ('Olpers Full Cream Milk 1L',   'DRY-001', '8888004000015', '0401.2000', 'UHT milk, 1 litre',                    295.00, 120, 'ACTIVE', 'pack', 'ZERO'),
 ('Nestle Milkpak 250ml',        'DRY-002', '8888004000022', '0401.2001', 'UHT milk, 250ml',                      95.00, 200, 'ACTIVE', 'pack', 'ZERO'),
 ('Everyday Milk Powder 900g',   'DRY-003', '8888004000039', '0402.2100', 'Tea whitener, 900g',                   1290.00, 5, 'ACTIVE', 'pack', 'GST18'),
 ('Nestle Yogurt 400g',          'DRY-004', '8888004000046', '0403.1000', 'Plain yogurt cup',                     180.00, 18, 'ACTIVE', 'pack', 'GST18'),
 ('Farm Eggs',                   'DRY-005', '8888004000053', '0407.2100', 'Fresh eggs, sold per dozen',           380.00, 40, 'ACTIVE', 'dz', 'ZERO'),
 ('Pepsi 1.5L',                  'BEV-001', '8888005000012', '2202.1010', 'Carbonated soft drink, 1.5L',          190.00, 96, 'ACTIVE', 'btl', 'GST18'),
 ('Coca-Cola 345ml Can',         'BEV-002', '8888005000029', '2202.1011', 'Carbonated soft drink can',            110.00, 144, 'ACTIVE', 'can', 'GST18'),
 ('Nestle Pure Life Water 1.5L', 'BEV-003', '8888005000036', '2201.1000', 'Bottled drinking water',                 90.00, 300, 'ACTIVE', 'btl', 'GST18'),
 ('Shezan Mango Juice 1L',       'BEV-004', '8888005000043', '2009.8990', 'Mango fruit drink',                    270.00, 2,  'ACTIVE', 'pack', 'GST18'),
 ('Rooh Afza 800ml',             'BEV-005', '8888005000050', '2106.9020', 'Rose syrup concentrate',               540.00, 26, 'ACTIVE', 'btl', 'GST18'),
 ('Lays Classic Chips 70g',      'SNK-001', '8888006000018', '2005.2000', 'Salted potato chips',                   80.00, 110, 'ACTIVE', 'pkt', 'GST18'),
 ('Kurkure Chutney Chaska 60g',  'SNK-002', '8888006000025', '1905.9090', 'Corn puffs snack',                      60.00, 85, 'ACTIVE', 'pkt', 'GST18'),
 ('Peek Freans Gluco Biscuits',  'SNK-003', '8888006000032', '1905.3100', 'Glucose biscuits family pack',          70.00, 6, 'ACTIVE', 'pkt', 'GST18'),
 ('Oreo Biscuits 6-Pack',        'SNK-004', '8888006000049', '1905.3101', 'Cream-filled biscuits',                 90.00, 64, 'ACTIVE', 'pack', 'GST18'),
 ('Dairy Milk Chocolate 40g',    'SNK-005', '8888006000056', '1806.3200', 'Milk chocolate bar',                   150.00, 0,  'ACTIVE', 'pcs', 'GST18'),
 ('Surf Excel 1kg',              'HOM-001', '8888007000011', '3402.2000', 'Laundry detergent powder, 1kg',        560.00, 38, 'ACTIVE', 'pack', 'GST18'),
 ('Lifebuoy Soap 130g',          'HOM-002', '8888007000028', '3401.1100', 'Antibacterial bath soap',              120.00, 150, 'ACTIVE', 'pcs', 'GST18'),
 ('Safeguard Soap 140g',         'HOM-003', '8888007000035', '3401.1101', 'Bath soap',                            135.00, 5, 'ACTIVE', 'pcs', 'GST18'),
 ('Head & Shoulders Shampoo 360ml','HOM-004','8888007000042','3305.1000', 'Anti-dandruff shampoo',                 780.00, 20, 'ACTIVE', 'btl', 'GST18'),
 ('Colgate Toothpaste 150g',     'HOM-005', '8888007000059', '3306.1000', 'Fluoride toothpaste',                  290.00, 45, 'ACTIVE', 'pcs', 'GST18'),
 ('Harpic Toilet Cleaner 500ml', 'HOM-006', '8888007000066', '3808.9400', 'Toilet cleaner',                       310.00, 14, 'ACTIVE', 'btl', 'GST18'),
 ('Dettol Antiseptic 250ml',     'HOM-007', '8888007000073', '3808.9401', 'Antiseptic liquid',                    360.00, 3, 'ACTIVE', 'btl', 'GST18'),
 ('Tissue Roll (Pack of 4)',     'HOM-008', '8888007000080', '4818.1000', 'Soft toilet tissue rolls',             260.00, 55, 'ACTIVE', 'pack', 'GST18'),
 ('Matchbox (Pack of 10)',       'HOM-009', '8888007000097', '3605.0000', 'Safety matches',                        50.00, 120, 'ACTIVE', 'pack', 'GST18'),
 ('Black Pepper Powder 100g',    'SPC-001', '8888008000016', '0904.2200', 'Ground black pepper',                  250.00, 30, 'ACTIVE', 'pkt', 'GST10'),
 ('Red Chilli Powder 200g',      'SPC-002', '8888008000023', '0904.2201', 'Ground red chilli',                    190.00, 52, 'ACTIVE', 'pkt', 'GST10'),
 ('Turmeric Powder 100g',        'SPC-003', '8888008000030', '0910.3000', 'Ground turmeric',                      130.00, 41, 'ACTIVE', 'pkt', 'GST10'),
 ('National Biryani Masala 50g', 'SPC-004', '8888008000047', '2103.9090', 'Biryani spice mix',                    105.00, 1,  'ACTIVE', 'sachet', 'GST10'),
 ('Potatoes',                    'VEG-001', '8888009000013', '0701.9000', 'Fresh potatoes',                        90.00, 80.75, 'ACTIVE', 'kg', 'ZERO'),
 ('Onions',                      'VEG-002', '8888009000020', '0703.1000', 'Fresh onions',                         110.00, 65.50, 'ACTIVE', 'kg', 'ZERO'),
 ('Tomatoes',                    'VEG-003', '8888009000037', '0702.0000', 'Fresh tomatoes',                       140.00, 0.00, 'ACTIVE', 'kg', 'ZERO'),
 ('Bananas',                     'VEG-004', '8888009000044', '0803.9000', 'Fresh bananas, per dozen',             180.00, 15, 'ACTIVE', 'dz', 'ZERO'),
 ('Old Brand Tea 50g (Discontinued)', 'OLD-001', '8888010000019', '0902.3002', 'No longer stocked',               120.00, 8, 'INACTIVE', 'pack', 'GST18'),
 ('Seasonal Dates Box 1kg',      'OLD-002', '8888010000026', '0804.1000', 'Ramadan special, out of season',       850.00, 0, 'INACTIVE', 'box', 'EXEMPT'),
 ('Imported Cheese Slices 200g', 'DRY-006', '8888004000060', '0406.9000', 'Processed cheese slices',              640.00, 9, 'ACTIVE', 'pack', 'GST18'),
 ('Plastic Shopping Bags (100)', 'HOM-010', '8888007000103', '3923.2100', 'Carry bags, pack of 100',              220.00, 28, 'ACTIVE', 'pack', 'FURTHER3'),
 ('Phone Recharge Card Rs 100',  'SRV-001', '8888011000015', '8523.5100', 'Prepaid mobile top-up card',           100.00, 500, 'ACTIVE', 'pcs', 'EXEMPT');

WITH target AS (
    SELECT COALESCE((:store_id)::uuid, (SELECT id FROM stores ORDER BY date_created LIMIT 1)) AS id
), inserted AS (
    INSERT INTO products (id, name, sku, barcode, pct_code, description, unit_price, stock_quantity,
                          status, units_of_measure_id, store_id, date_created, last_updated)
    SELECT gen_random_uuid(), s.name, s.sku, s.barcode, s.pct_code, s.description, s.unit_price, s.stock,
           s.status, u.id, t.id, now(), now()
    FROM seed_products s
    JOIN units_of_measures u ON u.code = s.unit_code
    CROSS JOIN target t
    WHERE t.id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM products p
          WHERE p.store_id = t.id
            AND (lower(p.pct_code) = lower(s.pct_code)
                 OR lower(p.sku) = lower(s.sku)
                 OR lower(p.barcode) = lower(s.barcode)))
    ON CONFLICT DO NOTHING
    RETURNING id, sku, store_id, stock_quantity
), taxes AS (
    INSERT INTO product_tax_categories (product_id, tax_category_id)
    SELECT i.id, tc.id
    FROM inserted i
    JOIN seed_products s ON s.sku = i.sku
    JOIN tax_categories tc ON tc.code = s.tax_code
    RETURNING product_id
)
INSERT INTO stock_movements (id, type, quantity, quantity_before, quantity_after, description,
                             product_id, store_id, date_created, last_updated)
SELECT gen_random_uuid(), 'ADJUSTMENT_IN', i.stock_quantity, 0, i.stock_quantity, 'Initial stock',
       i.id, i.store_id, now(), now()
FROM inserted i
WHERE i.stock_quantity <> 0;

COMMIT;
