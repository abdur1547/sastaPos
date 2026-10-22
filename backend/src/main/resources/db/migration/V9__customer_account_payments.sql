ALTER TABLE payments ALTER COLUMN sale_id DROP NOT NULL;
ALTER TABLE payments ADD COLUMN direction varchar(255) NOT NULL DEFAULT 'INCOMING';
ALTER TABLE payments ADD COLUMN customer_id uuid REFERENCES customers (id);
ALTER TABLE payments ADD COLUMN store_id uuid REFERENCES stores (id);
ALTER TABLE payments ADD COLUMN user_id uuid REFERENCES users (id);

UPDATE payments p SET store_id = s.store_id, user_id = s.user_id, customer_id = s.customer_id
FROM sales s WHERE p.sale_id = s.id;

ALTER TABLE payments ADD CONSTRAINT chk_customer_payment CHECK (
    sale_id IS NOT NULL OR (
        customer_id IS NOT NULL AND store_id IS NOT NULL AND user_id IS NOT NULL
        AND direction = 'INCOMING' AND amount > 0 AND method IN ('CASH', 'BANK')
    )
);
CREATE INDEX idx_payments_customer ON payments (customer_id);
CREATE INDEX idx_payments_store ON payments (store_id);

ALTER TABLE ledger_entries ADD COLUMN payment_id uuid REFERENCES payments (id);
ALTER TABLE ledger_entries ADD COLUMN store_id uuid REFERENCES stores (id);
ALTER TABLE ledger_entries ADD COLUMN user_id uuid REFERENCES users (id);
UPDATE ledger_entries l SET store_id = c.store_id FROM customers c WHERE l.customer_id = c.id;
CREATE UNIQUE INDEX uq_ledger_payment_posting ON ledger_entries (payment_id) WHERE type = 'PAYMENT';
