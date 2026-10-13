-- V7: the sales register is an append-only ledger (docs/use-cases.md 5a, 5b).
-- SaleService already refuses financial edits, but offline clients upload rows straight through
-- POST /api/sync/upload, so the rule is enforced on the table for every write path:
--   * IN_PROGRESS (draft): freely editable.
--   * COMPLETED: only the description may change, plus the one-way transition to VOIDED
--     (status, void_reason, voided_at, voided_by).
--   * VOIDED: read-only.
-- Re-uploading identical values (sync retries) is not a change. SQLSTATE 23000 maps to Spring's
-- DataIntegrityViolationException, so sync rejects just the offending row.

CREATE FUNCTION sales_guard_posted_changes() RETURNS trigger AS $$
DECLARE
    row_xmin xid;
BEGIN
    IF OLD.status = 'IN_PROGRESS' THEN
        RETURN NEW;
    END IF;

    -- A sale is posted once the transaction that completed it commits. The completing transaction
    -- itself may flush the row several times (ORM auto-flush), so its own row versions stay editable.
    SELECT xmin INTO row_xmin FROM sales WHERE id = OLD.id;
    IF row_xmin::text = (txid_current() % 4294967296)::text THEN
        RETURN NEW;
    END IF;

    IF OLD.status = 'VOIDED' AND (
            NEW.status IS DISTINCT FROM OLD.status
            OR NEW.description IS DISTINCT FROM OLD.description
            OR NEW.void_reason IS DISTINCT FROM OLD.void_reason
            OR NEW.voided_at IS DISTINCT FROM OLD.voided_at
            OR NEW.voided_by IS DISTINCT FROM OLD.voided_by) THEN
        RAISE EXCEPTION 'sale % is voided and read-only', OLD.id USING ERRCODE = '23000';
    END IF;

    IF OLD.status = 'COMPLETED' AND NEW.status NOT IN ('COMPLETED', 'VOIDED') THEN
        RAISE EXCEPTION 'completed sale % can only be voided', OLD.id USING ERRCODE = '23000';
    END IF;

    IF OLD.status = 'COMPLETED' AND NEW.status = 'COMPLETED' AND (
            NEW.void_reason IS NOT NULL OR NEW.voided_at IS NOT NULL OR NEW.voided_by IS NOT NULL) THEN
        RAISE EXCEPTION 'void details require voiding sale %', OLD.id USING ERRCODE = '23000';
    END IF;

    IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
            OR NEW.sale_type IS DISTINCT FROM OLD.sale_type
            OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
            OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
            OR NEW.taxable_amount IS DISTINCT FROM OLD.taxable_amount
            OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
            OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
            OR NEW.total_paid IS DISTINCT FROM OLD.total_paid
            OR NEW.remaining IS DISTINCT FROM OLD.remaining
            OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
            OR NEW.sold_at IS DISTINCT FROM OLD.sold_at
            OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
            OR NEW.user_id IS DISTINCT FROM OLD.user_id
            OR NEW.store_id IS DISTINCT FROM OLD.store_id THEN
        RAISE EXCEPTION 'sale % is posted; void it and create a new sale instead', OLD.id
            USING ERRCODE = '23000';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sales_guard_posted_changes
    BEFORE UPDATE ON sales
    FOR EACH ROW EXECUTE FUNCTION sales_guard_posted_changes();

CREATE INDEX idx_sales_store_status_sold_at ON sales (store_id, status, sold_at);
