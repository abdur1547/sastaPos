-- V4: sales, sale items, payments and sale-linked stock movements (docs/use-cases.md 5-5c).

ALTER TABLE sales ALTER COLUMN subtotal        TYPE numeric(18,2) USING round(subtotal::numeric, 2);
ALTER TABLE sales ALTER COLUMN discount_amount TYPE numeric(18,2) USING round(discount_amount::numeric, 2);
ALTER TABLE sales ALTER COLUMN taxable_amount  TYPE numeric(18,2) USING round(taxable_amount::numeric, 2);
ALTER TABLE sales ALTER COLUMN tax_amount      TYPE numeric(18,2) USING round(tax_amount::numeric, 2);
ALTER TABLE sales ALTER COLUMN total_amount    TYPE numeric(18,2) USING round(total_amount::numeric, 2);

ALTER TABLE sales ADD COLUMN sale_type    varchar(255) NOT NULL DEFAULT 'DEBIT';
ALTER TABLE sales ALTER COLUMN sale_type DROP DEFAULT;
ALTER TABLE sales ADD COLUMN total_paid   numeric(18,2);
ALTER TABLE sales ADD COLUMN remaining    numeric(18,2) NOT NULL DEFAULT 0;
UPDATE sales SET total_paid = total_amount;
ALTER TABLE sales ALTER COLUMN total_paid SET NOT NULL;
ALTER TABLE sales ADD COLUMN description  text;
ALTER TABLE sales ADD COLUMN void_reason  text;
ALTER TABLE sales ADD COLUMN voided_at    timestamptz;
ALTER TABLE sales ADD COLUMN voided_by    uuid;
ALTER TABLE sales ADD FOREIGN KEY (voided_by) REFERENCES users (id);

CREATE INDEX idx_sales_store_sold_at ON sales (store_id, sold_at);
CREATE INDEX idx_sales_customer ON sales (customer_id);

-- Sale items: taxes are always exclusive, so the inclusive flag goes away.
ALTER TABLE sale_items DROP COLUMN tax_inclusive;
ALTER TABLE sale_items ALTER COLUMN sku DROP NOT NULL;
ALTER TABLE sale_items ALTER COLUMN quantity       TYPE numeric(18,2) USING round(quantity::numeric, 2);
ALTER TABLE sale_items ALTER COLUMN unit_price     TYPE numeric(18,2) USING round(unit_price::numeric, 2);
ALTER TABLE sale_items ALTER COLUMN tax_rate       TYPE numeric(18,4) USING round(tax_rate::numeric, 4);
ALTER TABLE sale_items ALTER COLUMN taxable_amount TYPE numeric(18,2) USING round(taxable_amount::numeric, 2);
ALTER TABLE sale_items ALTER COLUMN line_total     TYPE numeric(18,2) USING round(line_total::numeric, 2);
CREATE INDEX idx_sale_items_sale ON sale_items (sale_id);
CREATE INDEX idx_sale_items_product ON sale_items (product_id);

CREATE TABLE payments (
    id               uuid          NOT NULL,
    amount           numeric(18,2) NOT NULL,
    method           varchar(255)  NOT NULL,
    reference_number varchar(255),
    description      text,
    sale_id          uuid          NOT NULL,
    date_created     timestamptz   NOT NULL,
    last_updated     timestamptz   NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (sale_id) REFERENCES sales (id)
);
CREATE INDEX idx_payments_sale ON payments (sale_id);

ALTER TABLE stock_movements ADD COLUMN sale_id uuid;
ALTER TABLE stock_movements ADD COLUMN sale_item_id uuid;
ALTER TABLE stock_movements ADD FOREIGN KEY (sale_id) REFERENCES sales (id);
ALTER TABLE stock_movements ADD FOREIGN KEY (sale_item_id) REFERENCES sale_items (id);
CREATE INDEX idx_stock_movements_sale ON stock_movements (sale_id);
