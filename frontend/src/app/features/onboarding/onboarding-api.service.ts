import { Injectable, inject } from "@angular/core";
import { firstValueFrom } from "rxjs";

import { BaseApiService } from "../../core/http/base-api.service";
import { OnlineService } from "../../core/network/online.service";
import { CreateCustomerInput } from "../customers/customer-input.model";
import { Customer } from "../customers/customer.model";
import { UnitOfMeasureOption } from "../products/product-lookup.model";
import { ProductFormValue } from "../products/components/product-form/product-form.model";
import { ProductListItem } from "../products/product-query.model";

interface ApiPage<T> {
  readonly content: readonly T[];
  readonly totalPages: number;
}

type CustomerResponse = Omit<Customer, "accountBalance" | "dateCreated"> & {
  readonly accountBalance: number;
  readonly createdAt: string;
};

type ProductResponse = Omit<
  ProductListItem,
  | "barcode"
  | "unitsOfMeasureId"
  | "unitsOfMeasureName"
  | "unitPrice"
  | "stockQuantity"
  | "dateCreated"
> & {
  readonly barCode: string | null;
  readonly unitOfMeasureId: string;
  readonly unitPrice: number;
  readonly stockQuantity: number;
  readonly createdAt: string;
};

/** Setup uses HTTP exclusively. PowerSync later downloads these server records. */
@Injectable({ providedIn: "root" })
export class OnboardingApiService extends BaseApiService {
  private readonly network = inject(OnlineService);

  async customers(): Promise<readonly Customer[]> {
    return (await this.all<CustomerResponse>("/api/customers")).map(toCustomer);
  }

  async createCustomer(value: CreateCustomerInput): Promise<Customer> {
    this.network.requireOnline();
    return toCustomer(
      await firstValueFrom(
        this.post<CustomerResponse>("/api/customers", value),
      ),
    );
  }

  async products(): Promise<readonly ProductListItem[]> {
    return (await this.all<ProductResponse>("/api/products")).map(toProduct);
  }

  units(): Promise<readonly UnitOfMeasureOption[]> {
    return this.all<UnitOfMeasureOption>(
      "/api/units-of-measure",
      "&isActive=true",
    );
  }

  async createProduct(value: ProductFormValue): Promise<ProductListItem> {
    this.network.requireOnline();
    const request = {
      name: value.name.trim(),
      sku: optionalText(value.sku),
      barCode: optionalText(value.barcode),
      pctCode: value.pctCode.trim(),
      description: optionalText(value.description),
      unitPrice: value.unitPrice,
      stockQuantity: value.stockQuantity,
      unitOfMeasureId: value.unitsOfMeasureId,
      taxCategoryIds: [],
    };
    return toProduct(
      await firstValueFrom(
        this.post<ProductResponse>("/api/products", request),
      ),
    );
  }

  private async all<T>(path: string, filters = ""): Promise<readonly T[]> {
    const rows: T[] = [];
    let page = 0;
    let totalPages = 1;
    do {
      this.network.requireOnline();
      const response = await firstValueFrom(
        this.get<ApiPage<T>>(`${path}?page=${page}&size=100${filters}`),
      );
      rows.push(...response.content);
      totalPages = response.totalPages;
      page++;
    } while (page < totalPages);
    return rows;
  }
}

function toCustomer(row: CustomerResponse): Customer {
  const { createdAt, accountBalance, ...rest } = row;
  return {
    ...rest,
    accountBalance: String(accountBalance),
    dateCreated: createdAt,
  };
}

function toProduct(row: ProductResponse): ProductListItem {
  const {
    barCode,
    unitOfMeasureId,
    unitPrice,
    stockQuantity,
    createdAt,
    ...rest
  } = row;
  return {
    ...rest,
    barcode: barCode,
    unitsOfMeasureId: unitOfMeasureId,
    unitsOfMeasureName: null,
    unitPrice: String(unitPrice),
    stockQuantity: String(stockQuantity),
    dateCreated: createdAt,
  };
}

export function optionalText(value: string): string | null {
  return value.trim() || null;
}
