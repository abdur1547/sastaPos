import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

import { AuthService } from "../../core/auth/auth.service";
import { CreateProductInput, UpdateProductInput } from "./product-input.model";
import {
  ProductValidationError,
} from "./product.errors";
import { ProductRepository, ProductChanges } from "./product.repository";
import { Product, ProductStatus } from "./product.model";
import {
  ProductFilters,
  ProductPage,
  ProductPageRequest,
} from "./product-query.model";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROW_STATUSES = new Set<ProductStatus>(["ACTIVE", "INACTIVE"]);

@Injectable({ providedIn: "root" })
export class ProductService {
  private readonly auth = inject(AuthService);
  private readonly repository = inject(ProductRepository);

  list(search = ""): Promise<readonly Product[]> {
    return this.repository.list(this.requireStoreId(), normalizeSearch(search));
  }

  watch(search = ""): Observable<readonly Product[]> {
    return this.repository.watch(
      this.requireStoreId(),
      normalizeSearch(search),
    );
  }

  watchPage(
    filters: ProductFilters,
    request: ProductPageRequest,
  ): Observable<ProductPage> {
    return this.repository.watchPage(this.requireStoreId(), filters, request);
  }

  findById(id: string): Promise<Product | null> {
    return this.repository.findById(
      requireUuid(id, "id"),
      this.requireStoreId(),
    );
  }

  async create(input: CreateProductInput): Promise<Product> {
    requireObject(input, "product");
    const storeId = this.requireStoreId();
    const now = new Date().toISOString();
    return this.repository.create({
      id: globalThis.crypto.randomUUID(),
      name: requiredText(input.name, "name", 255),
      sku: optionalText(input.sku, "sku", 255),
      barcode: optionalText(input.barcode, "barcode", 255),
      pctCode: requiredText(input.pctCode, "pctCode", 255),
      description: normalizeOptionalDescription(input.description),
      unitPrice: normalizeDecimal(input.unitPrice, "unitPrice"),
      stockQuantity:
        input.stockQuantity === undefined
          ? "0.00"
          : normalizeDecimal(input.stockQuantity, "stockQuantity"),
      status: "ACTIVE",
      unitsOfMeasureId: requireUuid(input.unitsOfMeasureId, "unitsOfMeasureId"),
      taxCategoryIds: normalizeTaxCategoryIds(input.taxCategoryIds ?? []),
      storeId,
      dateCreated: now,
      lastUpdated: now,
    });
  }

  update(id: string, input: UpdateProductInput): Promise<Product> {
    requireObject(input, "product changes");
    const productId = requireUuid(id, "id");
    const storeId = this.requireStoreId();
    const changes: ProductChanges = {};

    if (input.name !== undefined) {
      Object.assign(changes, { name: requiredText(input.name, "name", 255) });
    }
    if (input.sku !== undefined) {
      Object.assign(changes, { sku: optionalText(input.sku, "sku", 255) });
    }
    if (input.barcode !== undefined) {
      Object.assign(changes, {
        barcode: optionalText(input.barcode, "barcode", 255),
      });
    }
    if (input.pctCode !== undefined) {
      Object.assign(changes, {
        pctCode: requiredText(input.pctCode, "pctCode", 255),
      });
    }
    if (input.description !== undefined) {
      Object.assign(changes, {
        description: normalizeOptionalDescription(input.description),
      });
    }
    if (input.unitPrice !== undefined) {
      Object.assign(changes, {
        unitPrice: normalizeDecimal(input.unitPrice, "unitPrice"),
      });
    }
    if (input.status !== undefined) {
      if (!ROW_STATUSES.has(input.status)) {
        throw new ProductValidationError("status must be ACTIVE or INACTIVE.");
      }
      Object.assign(changes, { status: input.status });
    }
    if (input.unitsOfMeasureId !== undefined) {
      Object.assign(changes, {
        unitsOfMeasureId: requireUuid(
          input.unitsOfMeasureId,
          "unitsOfMeasureId",
        ),
      });
    }
    if (input.taxCategoryIds !== undefined) {
      Object.assign(changes, {
        taxCategoryIds: normalizeTaxCategoryIds(input.taxCategoryIds),
      });
    }
    if (Object.keys(changes).length === 0) {
      throw new ProductValidationError(
        "At least one editable product field is required.",
      );
    }

    return this.repository.update(productId, storeId, changes);
  }

  delete(id: string): Promise<void> {
    return this.repository.delete(requireUuid(id, "id"), this.requireStoreId());
  }

  private requireStoreId(): string {
    const storeId = this.auth.user()?.storeId;
    if (!storeId || !UUID_PATTERN.test(storeId)) {
      throw new ProductValidationError(
        "A valid store must be selected before managing products.",
      );
    }
    return storeId;
  }
}

function normalizeSearch(search: string): string {
  if (typeof search !== "string") {
    throw new ProductValidationError("search must be text.");
  }
  return search.trim();
}

function requireObject(value: unknown, field: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ProductValidationError(`${field} must be an object.`);
  }
}

function requiredText(value: string, field: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ProductValidationError(`${field} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new ProductValidationError(
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

function normalizeOptionalDescription(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string" || value.length > 5000) {
    throw new ProductValidationError(
      "description must be at most 5000 characters.",
    );
  }
  return value;
}

function normalizeDecimal(value: string, field: string): string {
  if (typeof value !== "string" || !/^\d{1,16}(?:\.\d{1,2})?$/.test(value)) {
    throw new ProductValidationError(
      `${field} must be a non-negative decimal with at most 16 integer and 2 fractional digits.`,
    );
  }
  const [integer, fraction = ""] = value.split(".");
  return `${integer}.${fraction.padEnd(2, "0")}`;
}

function requireUuid(value: string, field: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ProductValidationError(`${field} must be a valid UUID.`);
  }
  return value;
}

function normalizeTaxCategoryIds(ids: readonly string[]): readonly string[] {
  if (!Array.isArray(ids)) {
    throw new ProductValidationError(
      "taxCategoryIds must be an array of UUIDs.",
    );
  }
  const uniqueIds = [
    ...new Set(ids.map((id) => requireUuid(id, "taxCategoryIds entry"))),
  ];
  if (uniqueIds.length > 50) {
    throw new ProductValidationError(
      "taxCategoryIds must contain at most 50 entries.",
    );
  }
  return uniqueIds;
}
