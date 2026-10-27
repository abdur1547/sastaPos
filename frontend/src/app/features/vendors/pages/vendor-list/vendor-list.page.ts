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
import { MatSnackBar } from "@angular/material/snack-bar";
import { catchError, map, of, switchMap } from "rxjs";

import { VendorFiltersComponent } from "../../components/vendor-filters/vendor-filters.component";
import { VendorTableComponent } from "../../components/vendor-table/vendor-table.component";
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_VENDOR_FILTERS,
  PAGE_SIZE_OPTIONS,
  VendorFilters,
  VendorPage,
} from "../../vendor-query.model";
import { Vendor } from "../../vendor.model";
import { VendorService } from "../../vendor.service";
import { fromScaled, toScaled } from "../../../../shared/utils/decimal";

interface PageState {
  readonly page: VendorPage;
  readonly allVendors: readonly Vendor[];
  readonly loading: boolean;
  readonly error: string;
}

const EMPTY_PAGE: VendorPage = { items: [], total: 0 };

@Component({
  selector: "app-vendor-list-page",
  imports: [
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    VendorFiltersComponent,
    VendorTableComponent,
  ],
  templateUrl: "./vendor-list.page.html",
  styleUrl: "./vendor-list.page.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VendorListPage {
  private readonly router = inject(Router);
  private readonly vendors = inject(VendorService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly filters = signal<VendorFilters>(DEFAULT_VENDOR_FILTERS);
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
        this.vendors.watchPage(filters, { pageIndex, pageSize }).pipe(
          switchMap((page) =>
            this.vendors.watch().pipe(
              map(
                (allVendors): PageState => ({
                  page,
                  allVendors,
                  loading: false,
                  error: "",
                }),
              ),
            ),
          ),
          catchError((error: unknown) =>
            of<PageState>({
              page: EMPTY_PAGE,
              allVendors: [],
              loading: false,
              error:
                error instanceof Error ? error.message : "Could not load vendors.",
            }),
          ),
        ),
      ),
    ),
    {
      initialValue: {
        page: EMPTY_PAGE,
        allVendors: [],
        loading: true,
        error: "",
      },
    },
  );

  protected readonly items = computed(() => this.state().page.items);
  protected readonly total = computed(() => this.state().page.total);
  protected readonly loading = computed(() => this.state().loading);
  protected readonly error = computed(() => this.state().error);

  // Stats computed from all vendors in the store
  protected readonly stats = computed(() => {
    const list = this.state().allVendors;
    let payableScaled = 0n;
    let advanceScaled = 0n;

    for (const v of list) {
      const balance = toScaled(v.accountBalance, 2);
      if (balance < 0n) {
        payableScaled += -balance; // Store owes vendor
      } else if (balance > 0n) {
        advanceScaled += balance; // Vendor owes store (advance)
      }
    }

    return {
      totalCount: list.length,
      totalPayable: fromScaled(payableScaled, 2),
      totalAdvance: fromScaled(advanceScaled, 2),
    };
  });

  constructor() {
    effect(() => {
      const state = this.state();
      if (
        !state.loading &&
        state.page.items.length === 0 &&
        state.page.total === 0 &&
        this.pageIndex() > 0
      ) {
        this.pageIndex.set(0);
      }
    });
  }

  protected onFiltersChange(filters: VendorFilters): void {
    this.filters.set(filters);
    this.pageIndex.set(0);
  }

  protected onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  protected add(): void {
    void this.router.navigateByUrl("/vendors/new");
  }

  protected open(vendor: Vendor): void {
    void this.router.navigateByUrl(`/vendors/${vendor.id}/ledger`);
  }

  protected async onDelete(vendor: Vendor): Promise<void> {
    if (
      !confirm(
        `Are you sure you want to delete or deactivate vendor "${vendor.name}"?`,
      )
    ) {
      return;
    }
    try {
      const result = await this.vendors.delete(vendor.id);
      if (result.type === "HARD_DELETED") {
        this.snackBar.open("Vendor deleted permanently.", "Dismiss", {
          duration: 3000,
        });
      } else {
        this.snackBar.open(
          "Vendor had transaction history and was deactivated instead.",
          "Dismiss",
          { duration: 4000 },
        );
      }
    } catch (err) {
      this.snackBar.open(
        err instanceof Error ? err.message : "Could not delete vendor.",
        "Dismiss",
        { duration: 4000 },
      );
    }
  }
}

