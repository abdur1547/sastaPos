import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
} from "@angular/core";
import { toObservable, toSignal } from "@angular/core/rxjs-interop";
import { Router } from "@angular/router";
import { MatIconModule } from "@angular/material/icon";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { catchError, map, of, startWith, switchMap } from "rxjs";

import { SaleRegisterFiltersComponent } from "../../components/sale-register-filters/sale-register-filters.component";
import { SaleRegisterTableComponent } from "../../components/sale-register-table/sale-register-table.component";
import { SaleSummaryStripComponent } from "../../components/sale-summary-strip/sale-summary-strip.component";
import {
  CashierOption,
  EMPTY_SALE_SUMMARY,
  PAGE_SIZE_OPTIONS,
  SaleListItem,
  SalePage,
  SaleRegisterFilters,
  SaleSort,
} from "../../models/sale-register.model";
import { SaleRegisterService } from "../../sale-register.service";
import { SaleRegisterState } from "../../sale-register.state";

interface PageState {
  readonly page: SalePage;
  readonly loading: boolean;
  readonly error: string;
}

const EMPTY_PAGE: SalePage = { items: [], total: 0 };

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

@Component({
  selector: "app-sale-register-page",
  imports: [
    MatIconModule,
    MatPaginatorModule,
    SaleRegisterFiltersComponent,
    SaleRegisterTableComponent,
    SaleSummaryStripComponent,
  ],
  templateUrl: "./sale-register.page.html",
  styleUrl: "./sale-register.page.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaleRegisterPage {
  private readonly router = inject(Router);
  private readonly sales = inject(SaleRegisterService);
  protected readonly state = inject(SaleRegisterState);

  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly initialFilters = this.state.filters();

  private readonly pageState = toSignal(
    toObservable(
      computed(() => ({
        filters: this.state.filters(),
        sort: this.state.sort(),
        pageIndex: this.state.pageIndex(),
        pageSize: this.state.pageSize(),
      })),
    ).pipe(
      switchMap(({ filters, sort, pageIndex, pageSize }) =>
        this.sales.watchPage(filters, sort, { pageIndex, pageSize }).pipe(
          map((page): PageState => ({ page, loading: false, error: "" })),
          startWith<PageState>({ page: this.lastPage(), loading: true, error: "" }),
          catchError((error: unknown) =>
            of<PageState>({
              page: EMPTY_PAGE,
              loading: false,
              error: errorMessage(error, "Could not load sales."),
            }),
          ),
        ),
      ),
    ),
    { initialValue: { page: EMPTY_PAGE, loading: true, error: "" } },
  );

  protected readonly summary = toSignal(
    toObservable(this.state.filters).pipe(
      switchMap((filters) =>
        this.sales.watchSummary(filters).pipe(catchError(() => of(EMPTY_SALE_SUMMARY))),
      ),
    ),
    { initialValue: EMPTY_SALE_SUMMARY },
  );

  protected readonly cashiers = toSignal(
    this.sales.watchCashiers().pipe(catchError(() => of<readonly CashierOption[]>([]))),
    { initialValue: [] },
  );

  protected readonly items = computed(() => this.pageState().page.items);
  protected readonly total = computed(() => this.pageState().page.total);
  protected readonly loading = computed(() => this.pageState().loading);
  protected readonly error = computed(() => this.pageState().error);

  constructor() {
    // A void or a sync can shrink the result so the current page falls past the end.
    effect(() => {
      const { loading, page } = this.pageState();
      const pageIndex = this.state.pageIndex();
      if (loading || pageIndex === 0 || page.items.length > 0) {
        return;
      }
      const lastPage = Math.max(0, Math.ceil(page.total / this.state.pageSize()) - 1);
      this.state.pageIndex.set(Math.min(pageIndex, lastPage));
    });
  }

  protected onFiltersChange(filters: SaleRegisterFilters): void {
    this.state.filters.set(filters);
    this.state.pageIndex.set(0);
  }

  protected onSortChange(sort: SaleSort): void {
    this.state.sort.set(sort);
    this.state.pageIndex.set(0);
  }

  protected onPage(event: PageEvent): void {
    this.state.pageSize.set(event.pageSize);
    this.state.pageIndex.set(event.pageIndex);
  }

  protected open(sale: SaleListItem): void {
    void this.router.navigate(["/sales", sale.id]);
  }

  /** Keeps the previous rows visible (under the progress bar) while the next query runs. */
  private lastPage(): SalePage {
    return this.pageState?.()?.page ?? EMPTY_PAGE;
  }
}
