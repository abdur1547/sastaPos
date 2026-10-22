# FBR Pakistan POS Integration — Transaction Workflow Requirements

> These scenarios use the [backend-owned FBR DI design](./fbr-integration-plan.md): API v1.12, local-first intent capture, backend Java mapping/HTTPS/audit and backend-only secrets. Offline upload may trigger the first attempt later; subsequent attempts require a user command. Off-period exclusion remains frozen. Ordinary purchases retain supplier evidence; the 2023 model is obsolete. Note reason/sign rules remain verification gates.

## General Rules

1. Never delete an FBR-accepted invoice from the transaction history.
2. Keep sales/purchase invoices separate from payment receipts and supplier payments.
3. Every return must reference the original invoice.
4. Submit invoices, credit notes, debit notes, cancellations, and other adjustments to FBR only through the applicable approved workflow.
5. Save FBR request/response data, invoice identifiers, submission status, timestamps, and error messages.
6. Update inventory, accounts receivable/payable, and tax records consistently.
7. Do not submit the same invoice twice when retrying a failed request.
8. Apply the applicable FBR rules for invoice timing, tax calculation, correction windows, and reporting. Do not assume every purchase must be submitted as a sales invoice.

## Scenario 1: Cash Sale

1. Create the sales invoice.
2. Calculate applicable sales tax.
3. Commit the invoice, actual payment, inventory/accounting effects and fiscal snapshot/intent in one local SQLite transaction.
4. Upload financial operation/fiscal intent atomically when connected. After backend commit, one durable initial job maps/sends to FBR and persists request before HTTPS/response afterward. Offline upload later may trigger that first attempt, never a duplicate upload retry.
5. Keep the sale committed on FBR failure; show pending/needs-attention/unknown and require a user action for a safe retry.
6. Print or deliver the invoice with accepted verification details, or an explicitly marked provisional/off-period receipt subject to the approved receipt policy.

## Scenario 2: Credit Sale (Customer Pays Later)

1. Create the sales invoice when required under FBR's time-of-supply rules.
2. Commit the invoice, customer's outstanding balance, inventory effects and fiscal snapshot/intent together locally.
3. Upload the committed operation/intent when connected; backend durably schedules one initial attempt after its commit. Never wait for backend/FBR to commit the local credit sale.
4. Backend saves FBR response/identifier/failure in PG and replicates only safe status/issued ID/timestamps/actionable diagnostics to desktop; cached status can lag. Raw requests/responses have no frontend endpoint/export or sync copy in V1.
5. Require a user action for subsequent safe submission/retry; never resend blindly after a timeout.
6. When payment is received later, record a receipt against the original invoice.
7. Do not generate a second sales invoice for the payment.

## Scenario 3: Customer Returns Goods From a Cash Sale

1. Find the original sales invoice.
2. Create a sales-return document linked to it.
3. Record returned items, quantities, reason, values, and applicable tax adjustments.
4. Commit the return's stock/refund/account effects locally, then submit only the verified adjustment with original FBR reference. Do not assume the API accepts Credit Note because legal guidance uses that term; unverified reason/sign rules stay Needs attention.
5. Restore saleable returned goods to inventory.
6. Record the refund or customer credit.
7. Preserve the original invoice and the complete audit trail.

## Scenario 4: Customer Returns Goods From a Credit Sale

1. Find the original credit sales invoice.
2. Create a linked sales-return document.
3. Calculate the returned goods' taxable value and applicable tax adjustment.
4. Commit return effects locally, then submit only a verified adjustment linked to the original FBR ID; unverified note/reason/sign rules stay Needs attention, never a guessed Credit Note payload.
5. Restore saleable returned goods to inventory.
6. Reduce the customer's outstanding balance by the return amount.
7. If the customer already paid, record a refund or customer credit instead.
8. Preserve both the original invoice and return records.

## Scenario 5: Cash Purchase From a Supplier

1. Record the supplier's invoice and goods received.
2. Store supplier invoice details and applicable FBR verification information.
3. Update inventory and accounts payable/purchase accounting.
4. Record the payment against the supplier invoice.
5. Apply input-tax treatment only when permitted and supported by the required documentation.
6. Do not submit the purchase as your own sales invoice.
7. Mark ordinary purchase fiscal handling EVIDENCE_ONLY with supplier invoice/FBR identity and RECORDED_UNVERIFIED status unless actually verified. Special sector purchases require separate supported-profile certification.

## Scenario 6: Credit Purchase From a Supplier

1. Record the supplier's invoice and goods received.
2. Store the supplier invoice number, date, tax details, and available FBR verification information.
3. Increase inventory and record the supplier payable.
4. Apply eligible input-tax treatment according to applicable rules.
5. When payment is made, reduce accounts payable and record the payment.
6. Do not create a new purchase invoice when paying the supplier.
7. Retain supplier FBR evidence without generic purchase POST; paying later does not change that rule.

## Scenario 7: Return Goods to a Supplier After a Cash Purchase

1. Find the original supplier purchase invoice.
2. Create a purchase-return document linked to it.
3. Record returned quantities, reason, and applicable values.
4. Obtain and record the supplier's required credit note or supporting tax document.
5. Reduce inventory.
6. Record the refund due or credit available from the supplier.
7. Apply permitted input-tax adjustments.
8. Do not assume the purchase return automatically cancels the supplier's FBR invoice.
9. Ordinary purchase return/void is evidence-only, not an outbound Debit Note issued under the store's seller identity.

## Scenario 8: Return Goods to a Supplier After a Credit Purchase

1. Find the original supplier invoice.
2. Create a linked purchase-return document.
3. Record the returned goods and applicable tax adjustment.
4. Obtain and record the supplier's required credit note.
5. Reduce inventory and accounts payable.
6. Apply permitted input-tax adjustments.
7. If the supplier has already been paid, record a refund receivable or supplier credit instead.
8. Preserve the original purchase invoice and all adjustment records.

## Scenario 9: Partial Payment of a Credit Sale

1. Find the original customer invoice.
2. Record the amount received as a payment against that invoice.
3. Reduce accounts receivable by the amount received.
4. Update the cash or bank account.
5. Keep the original invoice unchanged.
6. Do not create another sales invoice or credit note.

## Scenario 10: Partial Payment to a Supplier

1. Find the original supplier invoice.
2. Record the payment against the supplier account.
3. Reduce accounts payable by the amount paid.
4. Update the cash or bank account.
5. Keep the original purchase invoice unchanged.
6. Do not create another purchase invoice.

## Scenario 11: Invoice Correction or Cancellation

1. Retrieve the original invoice and check its FBR status.
2. Determine whether the issue is a genuine cancellation/correction or an actual goods return.
3. Validate the applicable FBR correction window and approval requirements.
4. Submit the prescribed cancellation, correction, credit note, or debit note operation.
5. Save the FBR response and audit history.
6. Never silently overwrite an accepted invoice.
7. If FBR rejects the adjustment, retain the error and follow the prescribed resolution process.
8. An accepted invoice's local void requires a separately linked, verified fiscal reversal. Until the reversal contract is verified, block that void. Sending/unknown originals require reconciliation first; a never-accepted original may instead be cancelled before submission alongside the valid local void.
9. Fiscal-managed void first requires online backend reservation against canonical state, preventing dispatch races. Offline may save a request draft, not reverse business effects from stale state. Consume the reservation with the atomic void upload; no timeout-based reservation expiry that could restart dispatch while local void is pending.

## Scenario 12: Retry After FBR Submission Failure

1. Save the original submission attempt and error response.
2. Check whether FBR accepted the invoice despite a timeout or lost response.
3. If accepted, retrieve and save the existing FBR invoice reference.
4. If not accepted, retry according to the integration's prescribed idempotency and retry rules.
5. Do not create duplicate invoices.
6. Reconcile local invoices against FBR records.
7. No automatic second FBR attempt after failure/unknown. Backend may recover never-started initial jobs; durable orphaned starts become unknown. User Retry creates an idempotent command/one backend attempt, never repeats stock/payment effects or invokes a desktop fallback.

## Required Data Model

Maintain separate records for:

- Sales invoices
- Supplier purchase invoices
- Sales returns
- Purchase returns
- Credit notes and debit notes
- Invoice cancellations/corrections
- Customer receipts and refunds
- Supplier payments and refunds
- FBR submission attempts and responses

Each document should contain its internal ID, original invoice reference where applicable, items, quantities, taxable amounts, tax amounts, dates, status, and audit history.

## Important Implementation Constraints

- Determine whether the business falls under FBR Digital Invoicing, Tier-1 POS integration, or both.
- Follow the current applicable FBR technical specification and approved integration method.
- Distinguish a commercial return from a tax-invoice cancellation.
- Do not assume purchases are reported through the same API as sales.
- Do not assume a payment triggers a new invoice.
- Do not assume a locally recorded return is automatically reported to FBR.
- Validate the correct tax treatment, invoice timing, note type, and submission requirements against current FBR rules before implementing production behavior.