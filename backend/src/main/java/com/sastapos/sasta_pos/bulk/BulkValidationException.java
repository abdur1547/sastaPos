package com.sastapos.sasta_pos.bulk;


/** A single row failed validation; the row is rejected, the rest of the batch is unaffected. */
public class BulkValidationException extends RuntimeException {

    public BulkValidationException(final String message) {
        super(message);
    }

}
