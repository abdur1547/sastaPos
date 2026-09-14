# DB Schema

## All tables and properties

### 1. users
- name string, can't be null
- email string, globally unique
- password_hash text, can't be null
- role enum (OWNER, CASHIER, GLOBAL_ADMIN), default to CASHIER
- status enum (ACTIVE, IN_ACTIVE), default to ACTIVE

- can have one store, store_id UUID, can be null, default to null, (it will be null when user signed up but store is not yet created)
- can have many sales, sales done by this user

### 2. stores
- name string, can't be null
- ntn string, can't be null, globally unique
- address string, default to null
- currencyCode string, default to PKR
- timezone string, default to Asia/Karachi
- status enum (ACTIVE, IN_ACTIVE), default to ACTIVE

- have many users, all staff and owners
- have one store_setting, can't be null
- can have many products
- can have many customers
- can have many sales
- can have many stock_movements

### 3. products
- name string, can't be null
- sku string, default to null, unique in store (store specific code)
- barCode string, default to null
- pctCode string, can't be null, unique per store
- description text, default to null
- unitPrice NUMERIC(18,2), can't be null, default to 0.0 (current selling price, used as `product.currentUnitPrice` when creating sales)
- stockQuantity NUMERIC(18,2), default to 0.0
- status enum (ACTIVE, IN_ACTIVE), default to ACTIVE (store can hide a product instead of deleting it)
- createdAt datetime, can't be null, default to current date time

- have one unit_of_measure, -> unit_of_measure_id UUID, can't be null
- can have many tax_categories, a product can have many texes on it
- can have many stock_movements
- belongs to store or have one store
- can have many sale_items

### 4. unit_of_measures
- name string, can't be null
- symbol string, can't by null
- allowsFraction boolean, default to true
- status enum (ACTIVE, IN_ACTIVE), default to ACTIVE

- can have many products

### 5. sales
- invoiceNumber string, can't be null
- saleType enum (DEBIT, CREDIT), can't be null
- subtotal NUMERIC(18,2), can't be null
- discountAmount NUMERIC(18,2), can't be null, default to 0.0
- taxableAmount NUMERIC(18,2), can't be null
- taxAmount NUMERIC(18,2), can't be null
- totalAmount NUMERIC(18,2), can't be null
- currencyCode string, can't be null, default to PKR
- soldAt datetime, can't be null, defult to currenct date time
- saleStatus enum (COMPLETED, IN_PROGRESS, VOIDED), default to COMPLETED (IN_PROGRESS when this sale is saved as draft)
- totalPaid NUMERIC(18,2), can't be null (buyer paid on the spot, debit sale)
- remaining NUMERIC(18,2), can't be null, default to 0.0, (if buyer buy at credit, how much buyer will pay in fututre)
- voidReason text, can be null, default to null, required (validated at application level) when saleStatus is set to VOIDED
- voidedAt datetime, can be null, default to null, set when saleStatus is set to VOIDED
- voidedBy UUID, can be null, default to null, references the user who voided the sale

- can have one customer, optional for DEBIT sales, required for CREIDT sales
- have one user, staff member whoe performed this sale
- have many sale_items, each sale will have at minimum one sale item
- can have many payments, for DEBTI sale each sale should have at least one payment
- belongs to a ledger or have one ledger, for CREDIT sale it is required
- have many stock_movements

### 6. sale_items
- productName string, can't be null
- sku string, default to null
- quantity NUMERIC(18,2), can't be null
- unitPrice NUMERIC(18,2), can't be null
- taxRate NUMERIC(18,2), can't be null, default to 0.0 (0 if product has no applicable tax_categories, taxes are always exclusive/added on top)
- taxableAmount NUMERIC(18,2), can't be null
- lineTotal NUMERIC(18,2), can't be null

- have one product, can't be null
- have one sale, can't be null
- have one stock_movement, can't be null

### 7. payments
- description text, can't be null, (saler can add info i.e. cash payment, in account payment etc)
- amount NUMERIC(18,2), can't be null
- referenceNumber string, can be null
- description text, can be null
- method enum (CASH, BANK, CREDIT)

- have one sale

### 8. stock_movements
- type enum (SALE, STOCK_IN, ADJUSTMENT_IN, ADJUSTMENT_OUT), can't be null, default to SALE
- quantity NUMERIC(18,2), can't be null
- quantityBefore NUMERIC(18,2), can't be null
- quantityAfter NUMERIC(18,2), can't be null
- description text, can't be null

- have one sale, can be null, null in case of STOCK_IN, ADJUSTMENT_IN, ADJUSTMENT_OUT
- belongs to store, or have one store, can't be null
- belongs to sale_item, or can have one sale_item, not null in case of SALE, otherwise null
- belongs to product, can't be null in any case

### 9. store_settings
- invoicePrefix string, can't be null, default to ""
- invoiceNumberStart integer, can't be null, default to 1
- nextInvoiceNumber integer, can't be null
- receiptFooter string, can't be null, default to ""

- have one store, can't be null

### 10. customers
- name string, can't be null, unique per store
- phoneNumber string, can be null, default to null, unique globally
- ntn string, can be null, default to null
- accountBalance NUMERIC(18,2), can have sign, default to 0.0
- status enum (ACTIVE, IN_ACTIVE), can't be null, default to ACTIVE (soft-deleted/deactivated customers are hidden from default listing and can't be attached to new sales, but stay intact for historical sales/ledger)

- belongs to a store, can't be null
- have many sales
- have many ledger_entries

Customer.balance > 0  → Customer owes Store
Customer.balance < 0  → Store owes Customer
Customer.balance = 0  → Settled

### 11. ledger_entries
- direction enum (DEBIT, CREDIT), can't be null
- amount NUMERIC(18,2), can't be null
- type enum (SALE, PAYMENT, RETURN, ADJUSTMENT), can't be null
- reference_number string, can be null, default to null
- description string, can be null, default to null
- voided boolean, can't be null, default to false (set true only on an original `PAYMENT` entry that has been reversed; `ADJUSTMENT`/reversal entries themselves are never voided again)
- voidReason text, can be null, default to null, required (validated at application level) when `voided` is set to true
- voidedAt datetime, can be null, default to null, set when `voided` is set to true
- voidedBy UUID, can be null, default to null, references the user who voided the entry

- belongs to customer or have one customer, can't be null
- can have one sale in case of SALE, can be null in case of PAYMENT, RETURN, ADJUSTMENT

### 12. tax_categories
- name string, can't be null, globally unique
- symbol string, can be null, globally unique
- rate NUMERIC(18,2), can't be null
- calculationType string, can't be null

- can have many products