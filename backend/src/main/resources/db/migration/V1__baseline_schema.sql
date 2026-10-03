-- V1: baseline schema for all current JPA entities.
-- Table/column names match Hibernate's physical naming strategy (snake_case), which
-- ddl-auto: validate compares against. Creation order ensures every FK target exists.

CREATE TABLE business_settings (
    id                    uuid        NOT NULL,
    invoice_prefix        varchar(255) NOT NULL,
    invoice_number_start  integer     NOT NULL,
    next_invoice_number   integer     NOT NULL,
    receipt_footer        text        NOT NULL,
    date_created          timestamptz NOT NULL,
    last_updated          timestamptz NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE users (
    id            uuid        NOT NULL,
    name          varchar(255) NOT NULL,
    email         varchar(255) NOT NULL,
    password_hash text        NOT NULL,
    role          varchar(255) NOT NULL,
    status        varchar(255) NOT NULL,
    last_login_at timestamp,
    store_id      uuid,
    date_created  timestamptz NOT NULL,
    last_updated  timestamptz NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (email)
);

CREATE TABLE stores (
    id                uuid        NOT NULL,
    name              varchar(255) NOT NULL,
    ntn               varchar(255) NOT NULL,
    address           text,
    currency_code     varchar(255) NOT NULL,
    timezone          varchar(255) NOT NULL,
    status            varchar(255) NOT NULL,
    store_settings_id uuid        NOT NULL,
    date_created      timestamptz NOT NULL,
    last_updated      timestamptz NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (ntn),
    UNIQUE (store_settings_id),
    FOREIGN KEY (store_settings_id) REFERENCES business_settings (id)
);

ALTER TABLE users
    ADD FOREIGN KEY (store_id) REFERENCES stores (id);

CREATE TABLE password_reset_tokens (
    id           uuid        NOT NULL,
    user_id      uuid        NOT NULL,
    token_hash   text        NOT NULL,
    expires_at   timestamptz NOT NULL,
    used         boolean     NOT NULL,
    revoked      boolean     NOT NULL,
    date_created timestamptz NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (token_hash),
    FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE sales (
    id             uuid        NOT NULL,
    invoice_number varchar(255) NOT NULL,
    subtotal       float8      NOT NULL,
    discount_amount float8     NOT NULL,
    taxable_amount float8      NOT NULL,
    tax_amount     float8      NOT NULL,
    total_amount   float8      NOT NULL,
    currency_code  varchar(255) NOT NULL,
    status         varchar(255) NOT NULL,
    sold_at        timestamp   NOT NULL,
    user_id        uuid,
    store_id       uuid,
    date_created   timestamptz NOT NULL,
    last_updated   timestamptz NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (store_id) REFERENCES stores (id)
);

CREATE TABLE sale_items (
    id             uuid        NOT NULL,
    product_name   varchar(255) NOT NULL,
    sku            varchar(255) NOT NULL,
    quantity       float8      NOT NULL,
    unit_price     float8      NOT NULL,
    tax_rate       float8      NOT NULL,
    tax_inclusive  boolean     NOT NULL,
    taxable_amount float8      NOT NULL,
    line_total     float8      NOT NULL,
    sale_id        uuid        NOT NULL,
    product_id     uuid,
    date_created   timestamptz NOT NULL,
    last_updated   timestamptz NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (sale_id) REFERENCES sales (id)
);

CREATE TABLE tax_categories (
    id               uuid        NOT NULL,
    name             varchar(255) NOT NULL,
    code             varchar(255) NOT NULL,
    rate             float8      NOT NULL,
    calculation_type varchar(255) NOT NULL,
    is_exempt        boolean     NOT NULL,
    is_active        boolean     NOT NULL,
    effective_from   date,
    effective_to     date,
    sale_item_id     uuid        NOT NULL,
    store_id         uuid,
    date_created     timestamptz NOT NULL,
    last_updated     timestamptz NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (name),
    UNIQUE (code),
    FOREIGN KEY (sale_item_id) REFERENCES sale_items (id),
    FOREIGN KEY (store_id) REFERENCES stores (id)
);

CREATE TABLE units_of_measures (
    id              uuid        NOT NULL,
    name            varchar(255) NOT NULL,
    code            varchar(255) NOT NULL,
    allows_fraction boolean     NOT NULL,
    is_active       boolean     NOT NULL,
    date_created    timestamptz NOT NULL,
    last_updated    timestamptz NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (name),
    UNIQUE (code)
);

CREATE TABLE products (
    id                  uuid        NOT NULL,
    name                varchar(255) NOT NULL,
    sku                 varchar(255) NOT NULL,
    barcode             varchar(255) NOT NULL,
    description         text,
    selling_price       float8      NOT NULL,
    tax_rate            float8      NOT NULL,
    stock_quantity      float8      NOT NULL,
    status              varchar(255) NOT NULL,
    units_of_measure_id uuid        NOT NULL,
    tax_category_id     uuid        NOT NULL,
    store_id            uuid,
    date_created        timestamptz NOT NULL,
    last_updated        timestamptz NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (name),
    UNIQUE (sku),
    UNIQUE (barcode),
    FOREIGN KEY (units_of_measure_id) REFERENCES units_of_measures (id),
    FOREIGN KEY (tax_category_id) REFERENCES tax_categories (id),
    FOREIGN KEY (store_id) REFERENCES stores (id)
);

ALTER TABLE sale_items
    ADD FOREIGN KEY (product_id) REFERENCES products (id);

CREATE TABLE stock_movements (
    id             uuid        NOT NULL,
    type           varchar(255) NOT NULL,
    quantity       float8      NOT NULL,
    quantity_before float8     NOT NULL,
    quantity_after float8      NOT NULL,
    reference_type varchar(255) NOT NULL,
    reason         text        NOT NULL,
    product_id     uuid,
    store_id       uuid,
    date_created   timestamptz NOT NULL,
    last_updated   timestamptz NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (product_id) REFERENCES products (id),
    FOREIGN KEY (store_id) REFERENCES stores (id)
);
