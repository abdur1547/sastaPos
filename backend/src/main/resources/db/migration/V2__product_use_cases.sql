-- V2: align products / stock movements / tax categories with docs/use-cases.md (4, 4a-4d).

-- Tax categories become a many-to-many with products instead of hanging off a sale item.
ALTER TABLE tax_categories DROP COLUMN sale_item_id;

-- Products
ALTER TABLE products DROP CONSTRAINT products_name_key;
ALTER TABLE products DROP CONSTRAINT products_sku_key;
ALTER TABLE products DROP CONSTRAINT products_barcode_key;

ALTER TABLE products ADD COLUMN unit_price numeric(18,2);
ALTER TABLE products ADD COLUMN pct_code varchar(255);
UPDATE products SET unit_price = round(selling_price::numeric, 2), pct_code = sku;
ALTER TABLE products ALTER COLUMN unit_price SET NOT NULL;
ALTER TABLE products ALTER COLUMN pct_code SET NOT NULL;
ALTER TABLE products ALTER COLUMN stock_quantity TYPE numeric(18,2) USING round(stock_quantity::numeric, 2);
ALTER TABLE products ALTER COLUMN sku DROP NOT NULL;
ALTER TABLE products ALTER COLUMN barcode DROP NOT NULL;
ALTER TABLE products DROP COLUMN selling_price;
ALTER TABLE products DROP COLUMN tax_rate;
ALTER TABLE products DROP COLUMN tax_category_id;

-- sku / pctCode / barcode are unique per store (case-insensitive); sku and barcode are optional.
CREATE UNIQUE INDEX uq_products_store_sku ON products (store_id, lower(sku)) WHERE sku IS NOT NULL;
CREATE UNIQUE INDEX uq_products_store_pct_code ON products (store_id, lower(pct_code));
CREATE UNIQUE INDEX uq_products_store_barcode ON products (store_id, lower(barcode)) WHERE barcode IS NOT NULL;

CREATE TABLE product_tax_categories (
    product_id      uuid NOT NULL,
    tax_category_id uuid NOT NULL,
    PRIMARY KEY (product_id, tax_category_id),
    FOREIGN KEY (product_id) REFERENCES products (id),
    FOREIGN KEY (tax_category_id) REFERENCES tax_categories (id)
);

-- Stock movements
ALTER TABLE stock_movements DROP COLUMN reference_type;
ALTER TABLE stock_movements RENAME COLUMN reason TO description;
ALTER TABLE stock_movements ALTER COLUMN quantity TYPE numeric(18,2) USING round(quantity::numeric, 2);
ALTER TABLE stock_movements ALTER COLUMN quantity_before TYPE numeric(18,2) USING round(quantity_before::numeric, 2);
ALTER TABLE stock_movements ALTER COLUMN quantity_after TYPE numeric(18,2) USING round(quantity_after::numeric, 2);
