-- V6: PowerSync upload support.
-- product_tax_categories gets an `id` primary key (PowerSync needs one per synced row). The id is
-- the composite key encoded as ["productId","taxCategoryId"], the same value the desktop app
-- generates locally, so rows created on either side converge on one id.

ALTER TABLE product_tax_categories ADD COLUMN id text;
UPDATE product_tax_categories
SET id = '["' || product_id::text || '","' || tax_category_id::text || '"]';
ALTER TABLE product_tax_categories ALTER COLUMN id SET NOT NULL;

ALTER TABLE product_tax_categories DROP CONSTRAINT product_tax_categories_pkey;
ALTER TABLE product_tax_categories ADD PRIMARY KEY (id);
ALTER TABLE product_tax_categories
    ADD CONSTRAINT uq_product_tax_categories_pair UNIQUE (product_id, tax_category_id);

-- JPA's many-to-many inserts only know the two foreign keys.
CREATE FUNCTION product_tax_categories_set_id() RETURNS trigger AS $$
BEGIN
    IF NEW.id IS NULL THEN
        NEW.id := '["' || NEW.product_id::text || '","' || NEW.tax_category_id::text || '"]';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_product_tax_categories_set_id
    BEFORE INSERT ON product_tax_categories
    FOR EACH ROW EXECUTE FUNCTION product_tax_categories_set_id();
