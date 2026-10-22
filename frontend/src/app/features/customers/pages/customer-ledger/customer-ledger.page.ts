import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from "@angular/core";
import { toObservable, toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { catchError, defer, map, of, startWith, switchMap } from "rxjs";

import { CustomerLedgerFiltersComponent } from "../../components/customer-ledger-filters/customer-ledger-filters.component";
import { CustomerLedgerTableComponent } from "../../components/customer-ledger-table/customer-ledger-table.component";
import {
  CustomerLedgerFilters,
  CustomerLedgerPage as LedgerPage,
  DEFAULT_LEDGER_FILTERS,
  DEFAULT_LEDGER_PAGE_SIZE,
  DEFAULT_LEDGER_SORT,
  EMPTY_LEDGER_PAGE,
  LEDGER_PAGE_SIZE_OPTIONS,
  LedgerSort,
} from "../../customer-ledger.model";
import { CustomerService } from "../../customer.service";
import { customerBalanceLabel } from "../../customer-payment.model";
import { watchCustomerPage } from "../customer-page-state";

interface LedgerState {
  readonly page: LedgerPage;
  readonly loading: boolean;
  readonly error: string;
}

@Component({
  selector: "app-customer-ledger-page",
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    CustomerLedgerFiltersComponent,
    CustomerLedgerTableComponent,
  ],
  templateUrl: "./customer-ledger.page.html",
  styleUrls: ["../customer-account.scss", "./customer-ledger.page.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerLedgerPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly customers = inject(CustomerService);

  protected readonly balanceLabel = customerBalanceLabel;
  protected readonly pageSizeOptions = LEDGER_PAGE_SIZE_OPTIONS;

  protected readonly state = toSignal(watchCustomerPage(this.route, this.customers));

  protected readonly filters = signal<CustomerLedgerFilters>(DEFAULT_LEDGER_FILTERS);
  protected readonly sort = signal<LedgerSort>(DEFAULT_LEDGER_SORT);
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(DEFAULT_LEDGER_PAGE_SIZE);

  private readonly customerId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get("id") ?? "")),
    { initialValue: "" },
  );

  private readonly ledgerState = toSignal(
    toObservable(
      computed(() => ({
        customerId: this.customerId(),
        filters: this.filters(),
        sort: this.sort(),
        pageIndex: this.pageIndex(),
        pageSize: this.pageSize(),
      })),
    ).pipe(
      switchMap(({ customerId, filters, sort, pageIndex, pageSize }) =>
        defer(() =>
          this.customers.watchLedger(customerId, filters, sort, { pageIndex, pageSize }),
        ).pipe(
          map((page): LedgerState => ({ page, loading: false, error: "" })),
          startWith<LedgerState>({ page: this.lastPage(), loading: true, error: "" }),
          catchError((error: unknown) =>
            of<LedgerState>({
              page: EMPTY_LEDGER_PAGE,
              loading: false,
              error: error instanceof Error ? error.message : "Could not load ledger entries.",
            }),
          ),
        ),
      ),
    ),
    { initialValue: { page: EMPTY_LEDGER_PAGE, loading: true, error: "" } },
  );

  protected readonly entries = computed(() => this.ledgerState().page.items);
  protected readonly total = computed(() => this.ledgerState().page.total);
  protected readonly totalDebit = computed(() => this.ledgerState().page.totalDebit);
  protected readonly totalCredit = computed(() => this.ledgerState().page.totalCredit);
  protected readonly loading = computed(() => this.ledgerState().loading);
  protected readonly error = computed(() => this.ledgerState().error);

  constructor() {
    // A sync can shrink the result so the current page falls past the end.
    effect(() => {
      const { loading, page } = this.ledgerState();
      const pageIndex = this.pageIndex();
      if (loading || pageIndex === 0 || page.items.length > 0) {
        return;
      }
      const lastPage = Math.max(0, Math.ceil(page.total / this.pageSize()) - 1);
      this.pageIndex.set(Math.min(pageIndex, lastPage));
    });
  }

  protected onFiltersChange(filters: CustomerLedgerFilters): void {
    this.filters.set(filters);
    this.pageIndex.set(0);
  }

  protected onSortChange(sort: LedgerSort): void {
    this.sort.set(sort);
    this.pageIndex.set(0);
  }

  protected onPage(event: PageEvent): void {
    this.pageSize.set(event.pageSize);
    this.pageIndex.set(event.pageIndex);
  }

  protected openSale(saleId: string): void {
    void this.router.navigate(["/sales", saleId]);
  }

  /** Keeps the previous rows visible (under the progress bar) while the next query runs. */
  private lastPage(): LedgerPage {
    return this.ledgerState?.()?.page ?? EMPTY_LEDGER_PAGE;
  }
}
