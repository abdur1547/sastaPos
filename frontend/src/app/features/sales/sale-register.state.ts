import { Injectable, signal } from "@angular/core";

import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SALE_REGISTER_FILTERS,
  DEFAULT_SALE_SORT,
  SaleRegisterFilters,
  SaleSort,
} from "./models/sale-register.model";

/**
 * Register view state kept for the app session, so opening a sale and coming back lands on the
 * same filters, sort and page instead of resetting to "today".
 */
@Injectable({ providedIn: "root" })
export class SaleRegisterState {
  readonly filters = signal<SaleRegisterFilters>(DEFAULT_SALE_REGISTER_FILTERS);
  readonly sort = signal<SaleSort>(DEFAULT_SALE_SORT);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
}
