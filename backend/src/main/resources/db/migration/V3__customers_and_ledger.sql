-- V3: customers and ledger entries (docs/use-cases.md 6-6e); sales gain an optional customer link.

CREATE TABLE customers (
    id              uuid         NOT NULL,
    name            varchar(255) NOT NULL,
    phone_number    varchar(255),
    ntn             varchar(255),
    account_balance numeric(18,2) NOT NULL DEFAULT 0,
    status          varchar(255) NOT NULL,
    store_id        uuid         NOT NULL,
    date_created    timestamptz  NOT NULL,
    last_updated    timestamptz  NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (store_id) REFERENCES stores (id)
);

-- name is unique per store (case-insensitive); phone number is unique across all stores.
CREATE UNIQUE INDEX uq_customers_store_name ON customers (store_id, lower(name));
CREATE UNIQUE INDEX uq_customers_phone_number ON customers (phone_number) WHERE phone_number IS NOT NULL;

ALTER TABLE sales ADD COLUMN customer_id uuid;
ALTER TABLE sales ADD FOREIGN KEY (customer_id) REFERENCES customers (id);

CREATE TABLE ledger_entries (
    id               uuid          NOT NULL,
    direction        varchar(255)  NOT NULL,
    amount           numeric(18,2) NOT NULL,
    type             varchar(255)  NOT NULL,
    reference_number varchar(255),
    description      text,
    voided           boolean       NOT NULL DEFAULT false,
    void_reason      text,
    voided_at        timestamptz,
    voided_by        uuid,
    customer_id      uuid          NOT NULL,
    sale_id          uuid,
    date_created     timestamptz   NOT NULL,
    last_updated     timestamptz   NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (voided_by) REFERENCES users (id),
    FOREIGN KEY (customer_id) REFERENCES customers (id),
    FOREIGN KEY (sale_id) REFERENCES sales (id)
);

CREATE INDEX idx_ledger_entries_customer ON ledger_entries (customer_id);
