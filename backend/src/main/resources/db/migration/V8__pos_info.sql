-- V8: POS-level (not store-level) identity required by FBR digital invoicing. Single global row,
-- readable by any authenticated user and synced read-only to every device for offline use.
-- The FBR security token is deliberately NOT stored here; it stays local to each device.

CREATE TABLE pos_info (
    id                  uuid         NOT NULL,
    pos_id              varchar(255),
    pos_name            varchar(255),
    registration_number varchar(255),
    software_name       varchar(255),
    software_version    varchar(255),
    vendor_name         varchar(255),
    vendor_ntn          varchar(255),
    is_active           boolean      NOT NULL DEFAULT true,
    date_created        timestamptz  NOT NULL,
    last_updated        timestamptz  NOT NULL,
    PRIMARY KEY (id)
);

-- Enforce a single global row.
CREATE UNIQUE INDEX uq_pos_info_singleton ON pos_info ((true));

-- Vendor/FBR registration values are provisioned out of band (UPDATE pos_info ...); nothing is invented here.
INSERT INTO pos_info (id, pos_name, software_name, is_active, date_created, last_updated)
VALUES (gen_random_uuid(), 'Sasta POS', 'Sasta POS', true, now(), now());
