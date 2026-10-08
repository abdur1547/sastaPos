INSERT INTO units_of_measures (id, name, code, allows_fraction, is_active, date_created, last_updated)
SELECT gen_random_uuid(), s.name, s.code, s.allows_fraction, true, now(), now()
FROM (VALUES
    ('Piece', 'pcs', false),
    ('Kilogram', 'kg', true),
    ('Gram', 'g', true),
    ('Liter', 'l', true),
    ('Milliliter', 'ml', true),
    ('Meter', 'm', true),
    ('Centimeter', 'cm', true),
    ('Dozen', 'dz', false),
    ('Pack', 'pack', false),
    ('Box', 'box', false),
    ('Carton', 'ctn', false),
    ('Bottle', 'btl', false),
    ('Bag', 'bag', false),
    ('Pair', 'pair', false),
    ('Set', 'set', false),
    ('Roll', 'roll', false),
    ('Sachet', 'sachet', false),
    ('Can', 'can', false),
    ('Packet', 'pkt', false),
    ('Ton', 'ton', true)
) AS s (name, code, allows_fraction)
ON CONFLICT DO NOTHING;
