-- Dev seed: global tax categories (store_id NULL, visible to every store). Idempotent.
INSERT INTO tax_categories (id, name, code, rate, calculation_type, is_exempt, is_active, store_id, date_created, last_updated)
SELECT gen_random_uuid(), s.name, s.code, s.rate, 'PERCENTAGE', s.is_exempt, true, NULL, now(), now()
FROM (VALUES
    ('Standard Sales Tax (GST 18%)', 'GST18',  18.0, false),
    ('Reduced Sales Tax (GST 10%)',  'GST10',  10.0, false),
    ('Further Tax (3%)',             'FURTHER3', 3.0, false),
    ('Zero Rated',                   'ZERO',    0.0, false),
    ('Exempt',                       'EXEMPT',  0.0, true)
) AS s (name, code, rate, is_exempt)
ON CONFLICT DO NOTHING;
