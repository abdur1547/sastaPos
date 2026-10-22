import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

import { AuthService } from "../../core/auth/auth.service";
import { resolveSoldAtRange } from "../sales/domain/sale-date-range";
import {
  CustomerLedgerFilters,
  CustomerLedgerPage,
  LedgerPageRequest,
  LedgerSort,
} from "./customer-ledger.model";
import { CustomerLedgerRepository } from "./customer-ledger.repository";
import {
  CreateCustomerInput,
  UpdateCustomerInput,
} from "./customer-input.model";
import { CustomerValidationError } from "./customer.errors";
import { Customer, CustomerStatus } from "./customer.model";
import { CustomerChanges, CustomerRepository } from "./customer.repository";
import { CustomerPaymentRepository } from "./customer-payment.repository";
import { CustomerPaymentInput, paymentAmount } from "./customer-payment.model";
import {
  CustomerFilters,
  CustomerPage,
  CustomerPageRequest,
} from "./customer-query.model";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROW_STATUSES = new Set<CustomerStatus>(["ACTIVE", "INACTIVE"]);

@Injectable({ providedIn: "root" })
export class CustomerService {
  private readonly auth = inject(AuthService);
  private readonly repository = inject(CustomerRepository);
  private readonly payments = inject(CustomerPaymentRepository);
  private readonly ledger = inject(CustomerLedgerRepository);

  list(search = ""): Promise<readonly Customer[]> {
    return this.repository.list(this.requireStoreId(), normalizeSearch(search));
  }

  watch(search = ""): Observable<readonly Customer[]> {
    return this.repository.watch(
      this.requireStoreId(),
      normalizeSearch(search),
    );
  }

  watchPage(
    filters: CustomerFilters,
    request: CustomerPageRequest,
  ): Observable<CustomerPage> {
    return this.repository.watchPage(this.requireStoreId(), filters, request);
  }

  findById(id: string): Promise<Customer | null> {
    return this.repository.findById(
      requireUuid(id, "id"),
      this.requireStoreId(),
    );
  }

  watchById(id: string): Observable<Customer | null> {
    return this.repository.watchById(
      requireUuid(id, "id"),
      this.requireStoreId(),
    );
  }

  /** A page of the customer's ledger entries from the local database, re-emitting on change. */
  watchLedger(
    id: string,
    filters: CustomerLedgerFilters,
    sort: LedgerSort,
    request: LedgerPageRequest,
  ): Observable<CustomerLedgerPage> {
    return this.ledger.watchPage(
      {
        customerId: requireUuid(id, "id"),
        storeId: this.requireStoreId(),
        filters,
        range: resolveSoldAtRange(
          filters.datePreset,
          filters.customFrom,
          filters.customTo,
        ),
      },
      sort,
      request,
    );
  }

  takePayment(id: string, input: CustomerPaymentInput): Promise<string> {
    requireObject(input, "payment");
    const storeId = this.requireStoreId();
    const userId = requireUuid(this.auth.user()?.id ?? "", "user");
    if (input.method !== "CASH" && input.method !== "BANK") {
      throw new CustomerValidationError("Payment method must be CASH or BANK.");
    }
    return this.payments.takePayment({
      id: globalThis.crypto.randomUUID(),
      customerId: requireUuid(id, "id"),
      storeId,
      userId,
      amount: paymentAmount(input.amount),
      method: input.method,
      referenceNumber: paymentText(
        input.referenceNumber,
        "referenceNumber",
        255,
      ),
      description: paymentText(input.description, "description", 1000),
      allowCredit: input.allowCredit === true,
      createdAt: new Date().toISOString(),
    });
  }

  async create(input: CreateCustomerInput): Promise<Customer> {
    requireObject(input, "customer");
    const storeId = this.requireStoreId();
    const now = new Date().toISOString();
    return this.repository.create({
      id: globalThis.crypto.randomUUID(),
      name: requiredText(input.name, "name", 255),
      phoneNumber: optionalText(input.phoneNumber, "phoneNumber", 255),
      ntn: optionalText(input.ntn, "ntn", 255),
      accountBalance: "0.00",
      status: "ACTIVE",
      storeId,
      dateCreated: now,
      lastUpdated: now,
    });
  }

  update(id: string, input: UpdateCustomerInput): Promise<Customer> {
    requireObject(input, "customer changes");
    const customerId = requireUuid(id, "id");
    const storeId = this.requireStoreId();
    const changes: {
      -readonly [K in keyof CustomerChanges]: CustomerChanges[K];
    } = {};

    if (input.name !== undefined) {
      changes.name = requiredText(input.name, "name", 255);
    }
    if (input.phoneNumber !== undefined) {
      changes.phoneNumber = optionalText(input.phoneNumber, "phoneNumber", 255);
    }
    if (input.ntn !== undefined) {
      changes.ntn = optionalText(input.ntn, "ntn", 255);
    }
    if (input.status !== undefined) {
      if (!ROW_STATUSES.has(input.status)) {
        throw new CustomerValidationError("status must be ACTIVE or INACTIVE.");
      }
      changes.status = input.status;
    }
    if (Object.keys(changes).length === 0) {
      throw new CustomerValidationError(
        "At least one editable customer field is required.",
      );
    }

    return this.repository.update(customerId, storeId, changes);
  }

  delete(id: string): Promise<void> {
    return this.repository.delete(requireUuid(id, "id"), this.requireStoreId());
  }

  private requireStoreId(): string {
    const storeId = this.auth.user()?.storeId;
    if (!storeId || !UUID_PATTERN.test(storeId)) {
      throw new CustomerValidationError(
        "A valid store must be selected before managing customers.",
      );
    }
    return storeId;
  }
}

function normalizeSearch(search: string): string {
  if (typeof search !== "string") {
    throw new CustomerValidationError("search must be text.");
  }
  return search.trim();
}

function paymentText(
  value: string | null | undefined,
  field: string,
  max: number,
): string | null {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && !value.trim())
  )
    return null;
  return requiredText(value, field, max);
}

function requireObject(value: unknown, field: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CustomerValidationError(`${field} must be an object.`);
  }
}

function requiredText(value: string, field: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CustomerValidationError(`${field} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new CustomerValidationError(
      `${field} must be at most ${maxLength} characters.`,
    );
  }
  return normalized;
}

function optionalText(
  value: string | null | undefined,
  field: string,
  maxLength: number,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return requiredText(value, field, maxLength);
}

function requireUuid(value: string, field: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new CustomerValidationError(`${field} must be a valid UUID.`);
  }
  return value;
}
