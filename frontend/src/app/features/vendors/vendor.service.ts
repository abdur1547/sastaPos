import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

import { AuthService } from "../../core/auth/auth.service";
import { resolveSoldAtRange } from "../sales/domain/sale-date-range";
import {
  CreateVendorInput,
  UpdateVendorInput,
} from "./vendor-input.model";
import {
  DeleteVendorResult,
  VendorChanges,
  VendorRepository,
} from "./vendor.repository";
import {
  TaxRegistrationStatus,
  Vendor,
  VendorStatus,
} from "./vendor.model";
import {
  VendorValidationError,
} from "./vendor.errors";
import {
  DEFAULT_VENDOR_FILTERS,
  VendorFilters,
  VendorPage,
  VendorPageRequest,
} from "./vendor-query.model";
import {
  LedgerPageRequest,
  LedgerSort,
  VendorLedgerFilters,
  VendorLedgerPage,
  VendorLedgerSummary,
} from "./vendor-ledger.model";
import { VendorLedgerRepository } from "./vendor-ledger.repository";
import {
  parsePaymentAmount,
  RecordVendorPaymentInput,
} from "./vendor-payment.model";
import { VendorPaymentRepository } from "./vendor-payment.repository";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROW_STATUSES = new Set<VendorStatus>(["ACTIVE", "INACTIVE"]);
const TAX_REGISTRATION_STATUSES = new Set<TaxRegistrationStatus>([
  "REGISTERED",
  "UNREGISTERED",
]);

@Injectable({ providedIn: "root" })
export class VendorService {
  private readonly auth = inject(AuthService);
  private readonly repository = inject(VendorRepository);
  private readonly ledger = inject(VendorLedgerRepository);
  private readonly payments = inject(VendorPaymentRepository);

  list(search = ""): Promise<readonly Vendor[]> {
    return this.repository.list(this.requireStoreId(), normalizeSearch(search));
  }

  watch(search = ""): Observable<readonly Vendor[]> {
    return this.repository.watch(
      this.requireStoreId(),
      normalizeSearch(search),
    );
  }

  watchPage(
    filters: VendorFilters = DEFAULT_VENDOR_FILTERS,
    request: VendorPageRequest = { pageIndex: 0, pageSize: 25 },
  ): Observable<VendorPage> {
    return this.repository.watchPage(this.requireStoreId(), filters, request);
  }

  findById(id: string): Promise<Vendor | null> {
    return this.repository.findById(
      requireUuid(id, "id"),
      this.requireStoreId(),
    );
  }

  watchById(id: string): Observable<Vendor | null> {
    return this.repository.watchById(
      requireUuid(id, "id"),
      this.requireStoreId(),
    );
  }

  watchLedger(
    id: string,
    filters: VendorLedgerFilters,
    sort: LedgerSort,
    request: LedgerPageRequest,
  ): Observable<VendorLedgerPage> {
    return this.ledger.watchPage(
      {
        vendorId: requireUuid(id, "id"),
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

  getLedgerSummary(
    id: string,
    filters: VendorLedgerFilters,
  ): Promise<VendorLedgerSummary> {
    return this.ledger.getSummary({
      vendorId: requireUuid(id, "id"),
      storeId: this.requireStoreId(),
      filters,
      range: resolveSoldAtRange(
        filters.datePreset,
        filters.customFrom,
        filters.customTo,
      ),
    });
  }

  async create(input: CreateVendorInput): Promise<Vendor> {
    requireObject(input, "vendor");
    const storeId = this.requireStoreId();
    const now = new Date().toISOString();

    const name = requiredText(input.name, "name", 255);
    const phoneNumber = optionalText(input.phoneNumber, "phoneNumber", 255);
    const ntn = optionalText(input.ntn, "ntn", 255);
    const regStatus = input.salesTaxRegistrationStatus ?? "UNREGISTERED";
    if (!TAX_REGISTRATION_STATUSES.has(regStatus)) {
      throw new VendorValidationError(
        "salesTaxRegistrationStatus must be REGISTERED or UNREGISTERED.",
      );
    }

    const strn = optionalText(input.strn, "strn", 255);
    if (regStatus === "REGISTERED" && !strn) {
      throw new VendorValidationError(
        "STRN is required when sales tax registration status is REGISTERED.",
      );
    }

    const address = optionalText(input.address, "address", 500);

    return this.repository.create({
      id: globalThis.crypto.randomUUID(),
      name,
      phoneNumber,
      ntn,
      strn,
      salesTaxRegistrationStatus: regStatus,
      address,
      accountBalance: "0.00",
      status: "ACTIVE",
      storeId,
      dateCreated: now,
      lastUpdated: now,
    });
  }

  async update(id: string, input: UpdateVendorInput): Promise<Vendor> {
    requireObject(input, "vendor changes");
    const vendorId = requireUuid(id, "id");
    const storeId = this.requireStoreId();
    const existing = await this.repository.findById(vendorId, storeId);
    if (!existing) {
      throw new VendorValidationError(`Vendor ${id} not found.`);
    }

    const changes: {
      -readonly [K in keyof VendorChanges]: VendorChanges[K];
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

    const targetRegStatus =
      input.salesTaxRegistrationStatus ?? existing.salesTaxRegistrationStatus;
    if (input.salesTaxRegistrationStatus !== undefined) {
      if (!TAX_REGISTRATION_STATUSES.has(input.salesTaxRegistrationStatus)) {
        throw new VendorValidationError(
          "salesTaxRegistrationStatus must be REGISTERED or UNREGISTERED.",
        );
      }
      changes.salesTaxRegistrationStatus = input.salesTaxRegistrationStatus;
    }

    if (input.strn !== undefined) {
      changes.strn = optionalText(input.strn, "strn", 255);
    }

    const effectiveStrn =
      input.strn !== undefined ? changes.strn : existing.strn;
    if (targetRegStatus === "REGISTERED" && !effectiveStrn) {
      throw new VendorValidationError(
        "STRN is required when sales tax registration status is REGISTERED.",
      );
    }

    if (input.address !== undefined) {
      changes.address = optionalText(input.address, "address", 500);
    }
    if (input.status !== undefined) {
      if (!ROW_STATUSES.has(input.status)) {
        throw new VendorValidationError("status must be ACTIVE or INACTIVE.");
      }
      changes.status = input.status;
    }

    if (Object.keys(changes).length === 0) {
      throw new VendorValidationError(
        "At least one editable vendor field is required.",
      );
    }

    return this.repository.update(vendorId, storeId, changes);
  }

  delete(id: string): Promise<DeleteVendorResult> {
    return this.repository.delete(requireUuid(id, "id"), this.requireStoreId());
  }

  async recordPayment(
    id: string,
    input: RecordVendorPaymentInput,
  ): Promise<string> {
    requireObject(input, "payment");
    const storeId = this.requireStoreId();
    const userId = requireUuid(this.auth.user()?.id ?? "", "user");

    if (input.direction !== "INCOMING" && input.direction !== "OUTGOING") {
      throw new VendorValidationError(
        "Payment direction must be INCOMING or OUTGOING.",
      );
    }
    if (input.method !== "CASH" && input.method !== "BANK") {
      throw new VendorValidationError("Payment method must be CASH or BANK.");
    }

    return this.payments.takePayment({
      id: globalThis.crypto.randomUUID(),
      vendorId: requireUuid(id, "id"),
      storeId,
      userId,
      direction: input.direction,
      amount: parsePaymentAmount(input.amount),
      method: input.method,
      referenceNumber: paymentText(
        input.referenceNumber,
        "referenceNumber",
        255,
      ),
      description: paymentText(input.description, "description", 1000),
      allowZeroCross: input.allowZeroCross === true,
      createdAt: new Date().toISOString(),
    });
  }

  async voidPayment(
    paymentId: string,
    vendorId: string,
    voidReason: string,
  ): Promise<string> {
    const user = this.auth.user();
    if (user?.role !== "OWNER") {
      throw new VendorValidationError("Only the store owner can void a payment.");
    }
    return this.payments.voidPayment(
      this.requireStoreId(),
      requireUuid(user.id, "user"),
      requireUuid(paymentId, "paymentId"),
      requireUuid(vendorId, "vendorId"),
      voidReason,
    );
  }

  private requireStoreId(): string {
    const storeId = this.auth.user()?.storeId;
    if (!storeId || !UUID_PATTERN.test(storeId)) {
      throw new VendorValidationError(
        "A valid store must be selected before managing vendors.",
      );
    }
    return storeId;
  }
}

function normalizeSearch(search: string): string {
  if (typeof search !== "string") {
    throw new VendorValidationError("search must be text.");
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
    throw new VendorValidationError(`${field} must be an object.`);
  }
}

function requiredText(value: string, field: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new VendorValidationError(`${field} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new VendorValidationError(
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
    throw new VendorValidationError(`${field} must be a valid UUID.`);
  }
  return value;
}
