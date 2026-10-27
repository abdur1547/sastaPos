-- V10: vendors, vendor ledger, settlements, and reversals (docs/use-cases.md 8-8e).

CREATE TABLE vendors (
    id                            uuid         NOT NULL,
    name                          varchar(255) NOT NULL,
    phone_number                  varchar(255),
    ntn                           varchar(255),
    strn                          varchar(255),
    sales_tax_registration_status varchar(255) NOT NULL DEFAULT 'UNREGISTERED',
    address                       text,
    account_balance               numeric(18,2) NOT NULL DEFAULT 0.00,
    status                        varchar(255) NOT NULL DEFAULT 'ACTIVE',
    store_id                      uuid         NOT NULL,
    date_created                  timestamptz  NOT NULL,
    last_updated                  timestamptz  NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (store_id) REFERENCES stores (id)
);

CREATE UNIQUE INDEX uq_vendors_store_name ON vendors (store_id, lower(name));
CREATE UNIQUE INDEX uq_vendors_phone_number ON vendors (phone_number) WHERE phone_number IS NOT NULL;
CREATE INDEX idx_vendors_store ON vendors (store_id);

-- Payments: add vendor link, void audit columns, relax check constraint to allow customer or vendor settlements
-- in either INCOMING or OUTGOING direction (e.g. customer refunds or vendor payments).
ALTER TABLE payments ADD COLUMN vendor_id uuid REFERENCES vendors (id);
ALTER TABLE payments ADD COLUMN voided boolean NOT NULL DEFAULT false;
ALTER TABLE payments ADD COLUMN void_reason text;
ALTER TABLE payments ADD COLUMN voided_at timestamptz;
ALTER TABLE payments ADD COLUMN voided_by uuid REFERENCES users (id);
CREATE INDEX idx_payments_vendor ON payments (vendor_id);

ALTER TABLE payments DROP CONSTRAINT IF EXISTS chk_customer_payment;
ALTER TABLE payments ADD CONSTRAINT chk_payment_party CHECK (
    sale_id IS NOT NULL OR (
        ((customer_id IS NOT NULL AND vendor_id IS NULL) OR (customer_id IS NULL AND vendor_id IS NOT NULL))
        AND store_id IS NOT NULL AND user_id IS NOT NULL
        AND direction IN ('INCOMING', 'OUTGOING') AND amount > 0 AND method IN ('CASH', 'BANK')
    )
);

-- Ledger entries: support vendors and entry reversals.
ALTER TABLE ledger_entries ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE ledger_entries ADD COLUMN vendor_id uuid REFERENCES vendors (id);
ALTER TABLE ledger_entries ADD COLUMN reversal_of_entry_id uuid REFERENCES ledger_entries (id);
CREATE INDEX idx_ledger_entries_vendor ON ledger_entries (vendor_id);
CREATE INDEX idx_ledger_entries_reversal_of ON ledger_entries (reversal_of_entry_id);

ALTER TABLE ledger_entries ADD CONSTRAINT chk_ledger_party CHECK (
    (customer_id IS NOT NULL AND vendor_id IS NULL) OR
    (customer_id IS NULL AND vendor_id IS NOT NULL)
);
