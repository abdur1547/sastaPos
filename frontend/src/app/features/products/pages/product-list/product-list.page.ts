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

import { ProductFiltersComponent } from "../../components/product-filters/product-filters.component";
import { ProductTableComponent } from "../../components/product-table/product-table.component";
import { ProductLookupService } from "../../product-lookup.service";
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_PRODUCT_FILTERS,
  PAGE_SIZE_OPTIONS,
  ProductFilters,
  ProductListItem,
  ProductPage,
} from "../../product-query.model";
import { ProductService } from "../../product.service";

interface PageState {
  readonly page: ProductPage;
  readonly loading: boolean;
  readonly error: string;
}

const EMPTY_PAGE: ProductPage = { items: [], total: 0 };

@Component({
  selector: "app-product-list-page",
  imports: [
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    ProductFiltersComponent,
    ProductTableComponent,
  ],
  templateUrl: "./product-list.page.html",
  styleUrl: "./product-list.page.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductListPage {
  private readonly router = inject(Router);
  private readonly products = inject(ProductService);

  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly filters = signal<ProductFilters>(DEFAULT_PRODUCT_FILTERS);
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);

  protected readonly unitsOfMeasure = toSignal(
    inject(ProductLookupService).watchUnitsOfMeasure(),
    { initialValue: [] },
  );

  private readonly state = toSignal(
    toObservable(
      computed(() => ({
        filters: this.filters(),
        pageIndex: this.pageIndex(),
        pageSize: this.pageSize(),
      })),
    ).pipe(
      switchMap(({ filters, pageIndex, pageSize }) =>
        this.products.watchPage(filters, { pageIndex, pageSize }).pipe(
          map((page): PageState => ({ page, loading: false, error: "" })),
          catchError((error: unknown) =>
            of<PageState>({
              page: EMPTY_PAGE,
              loading: false,
              error: error instanceof Error ? error.message : "Could not load products.",
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

  protected onFiltersChange(filters: ProductFilters): void {
    this.filters.set(filters);
    this.pageIndex.set(0);
  }

  protected onPage(event: PageEvent): void {
    this.pageSize.set(event.pageSize);
    this.pageIndex.set(event.pageIndex);
  }

  protected open(product: ProductListItem): void {
    void this.router.navigate(["/products", product.id]);
  }

  protected add(): void {
    void this.router.navigate(["/products", "new"]);
  }
}
