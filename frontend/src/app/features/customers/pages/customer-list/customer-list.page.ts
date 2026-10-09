import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from "@angular/core";
import { toObservable, toSignal } from "@angular/core/rxjs-interop";
import { Router } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { catchError, map, of, switchMap } from "rxjs";

import { CustomerFiltersComponent } from "../../components/customer-filters/customer-filters.component";
import { CustomerTableComponent } from "../../components/customer-table/customer-table.component";
import {
  CustomerFilters,
  CustomerListItem,
  CustomerPage,
  DEFAULT_CUSTOMER_FILTERS,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
} from "../../customer-query.model";
import { CustomerService } from "../../customer.service";

interface PageState {
  readonly page: CustomerPage;
  readonly loading: boolean;
  readonly error: string;
}

const EMPTY_PAGE: CustomerPage = { items: [], total: 0 };

@Component({
  selector: "app-customer-list-page",
  imports: [
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    CustomerFiltersComponent,
    CustomerTableComponent,
  ],
  templateUrl: "./customer-list.page.html",
  styleUrl: "./customer-list.page.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerListPage {
  private readonly router = inject(Router);
  private readonly customers = inject(CustomerService);

  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly filters = signal<CustomerFilters>(DEFAULT_CUSTOMER_FILTERS);
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);

  private readonly state = toSignal(
    toObservable(
      computed(() => ({
        filters: this.filters(),
        pageIndex: this.pageIndex(),
        pageSize: this.pageSize(),
      })),
    ).pipe(
      switchMap(({ filters, pageIndex, pageSize }) =>
        this.customers.watchPage(filters, { pageIndex, pageSize }).pipe(
          map((page): PageState => ({ page, loading: false, error: "" })),
          catchError((error: unknown) =>
            of<PageState>({
              page: EMPTY_PAGE,
              loading: false,
              error: error instanceof Error ? error.message : "Could not load customers.",
            }),
          ),
        ),
      ),
    ),
    { initialValue: { page: EMPTY_PAGE, loading: true, error: "" } },
  );

  protected readonly items = computed(() => this.state().page.items);
  protected readonly total = computed(() => this.state().page.total);
  protected readonly loading = computed(() => this.state().loading);
  protected readonly error = computed(() => this.state().error);

  constructor() {
    // Deleting or filtering rows can leave the current page past the end.
    effect(() => {
      const state = this.state();
      if (!state.loading && state.page.items.length === 0 && state.page.total === 0 && this.pageIndex() > 0) {
        this.pageIndex.set(0);
      }
    });
  }

  protected onFiltersChange(filters: CustomerFilters): void {
    this.filters.set(filters);
    this.pageIndex.set(0);
  }

  protected onPage(event: PageEvent): void {
    this.pageSize.set(event.pageSize);
    this.pageIndex.set(event.pageIndex);
  }

  protected open(customer: CustomerListItem): void {
    void this.router.navigate(["/customers", customer.id]);
  }

  protected add(): void {
    void this.router.navigate(["/customers", "new"]);
  }
}
