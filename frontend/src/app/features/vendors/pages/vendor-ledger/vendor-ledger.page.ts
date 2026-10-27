import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { DatePipe } from "@angular/common";
import { toObservable, toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { MatSnackBar } from "@angular/material/snack-bar";
import { FormsModule } from "@angular/forms";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import {
  catchError,
  combineLatest,
  from,
  map,
  of,
  switchMap,
} from "rxjs";

import { VendorLedgerFiltersComponent } from "../../components/vendor-ledger-filters/vendor-ledger-filters.component";
import { VendorLedgerTableComponent } from "../../components/vendor-ledger-table/vendor-ledger-table.component";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
} from "../../vendor-query.model";
import {
  DEFAULT_VENDOR_LEDGER_FILTERS,
  EMPTY_VENDOR_LEDGER_PAGE,
  LedgerSort,
  VendorLedgerEntry,
  VendorLedgerFilters,
  VendorLedgerPage as VendorLedgerPageModel,
  VendorLedgerSummary,
} from "../../vendor-ledger.model";
import {
  Vendor,
  vendorBalanceAmount,
  vendorBalanceLabel,
  vendorBalanceState,
} from "../../vendor.model";
import { VendorService } from "../../vendor.service";
import { vendorBalanceInWords } from "../../../../shared/utils/number-to-words";
import { AuthService } from "../../../../core/auth/auth.service";

interface LedgerState {
  readonly vendor: Vendor | null;
  readonly page: VendorLedgerPageModel;
  readonly summary: VendorLedgerSummary | null;
  readonly loading: boolean;
  readonly error: string;
}

const EMPTY_SUMMARY: VendorLedgerSummary = {
  currentBalance: "0.00",
  openingBalance: "0.00",
  closingBalance: "0.00",
  debitTotal: "0.00",
  creditTotal: "0.00",
};

@Component({
  selector: "app-vendor-ledger-page",
  imports: [
    DatePipe,
    RouterLink,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    VendorLedgerFiltersComponent,
    VendorLedgerTableComponent,
  ],
  templateUrl: "./vendor-ledger.page.html",
  styleUrl: "./vendor-ledger.page.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VendorLedgerPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly vendors = inject(VendorService);
  private readonly auth = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly filters = signal<VendorLedgerFilters>(
    DEFAULT_VENDOR_LEDGER_FILTERS,
  );
  protected readonly sort = signal<LedgerSort>({
    field: "occurredAt",
    direction: "desc",
  });
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);

  // Void modal state
  protected readonly voidingEntry = signal<VendorLedgerEntry | null>(null);
  protected readonly voidReason = signal("");
  protected readonly voidError = signal("");
  protected readonly isVoiding = signal(false);

  private readonly vendorId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get("id"))),
    { initialValue: null },
  );

  private readonly state = toSignal(
    combineLatest([
      this.route.paramMap.pipe(map((params) => params.get("id"))),
      toObservable(this.filters),
      toObservable(this.sort),
      toObservable(this.pageIndex),
      toObservable(this.pageSize),
    ]).pipe(
      switchMap(([id, filters, sort, pageIndex, pageSize]) => {
        if (!id) {
          return of<LedgerState>({
            vendor: null,
            page: EMPTY_VENDOR_LEDGER_PAGE,
            summary: EMPTY_SUMMARY,
            loading: false,
            error: "Vendor ID required.",
          });
        }

        return this.vendors.watchById(id).pipe(
          switchMap((vendor) => {
            if (!vendor) {
              return of<LedgerState>({
                vendor: null,
                page: EMPTY_VENDOR_LEDGER_PAGE,
                summary: EMPTY_SUMMARY,
                loading: false,
                error: "Vendor not found.",
              });
            }

            return this.vendors
              .watchLedger(id, filters, sort, { pageIndex, pageSize })
              .pipe(
                switchMap((page) =>
                  from(this.vendors.getLedgerSummary(id, filters)).pipe(
                    map((summary) => ({
                      vendor,
                      page,
                      summary,
                      loading: false,
                      error: "",
                    })),
                    catchError((summaryErr: unknown) =>
                      of<LedgerState>({
                        vendor,
                        page,
                        summary: EMPTY_SUMMARY,
                        loading: false,
                        error:
                          summaryErr instanceof Error
                            ? summaryErr.message
                            : "Failed to load ledger summary.",
                      }),
                    ),
                  ),
                ),
                catchError((ledgerErr: unknown) =>
                  of<LedgerState>({
                    vendor,
                    page: EMPTY_VENDOR_LEDGER_PAGE,
                    summary: EMPTY_SUMMARY,
                    loading: false,
                    error:
                      ledgerErr instanceof Error
                        ? ledgerErr.message
                        : "Failed to load ledger.",
                  }),
                ),
              );
          }),
          catchError((err: unknown) =>
            of<LedgerState>({
              vendor: null,
              page: EMPTY_VENDOR_LEDGER_PAGE,
              summary: EMPTY_SUMMARY,
              loading: false,
              error: err instanceof Error ? err.message : "Failed to load vendor.",
            }),
          ),
        );
      }),
    ),
    {
      initialValue: {
        vendor: null,
        page: EMPTY_VENDOR_LEDGER_PAGE,
        summary: null,
        loading: true,
        error: "",
      },
    },
  );

  protected readonly vendor = computed(() => this.state().vendor);
  protected readonly page = computed(() => this.state().page);
  protected readonly summary = computed(() => this.state().summary);
  protected readonly loading = computed(() => this.state().loading);
  protected readonly error = computed(() => this.state().error);

  protected readonly items = computed(() => this.page().items);
  protected readonly total = computed(() => this.page().total);
  protected readonly totalDebit = computed(() => this.page().totalDebit);
  protected readonly totalCredit = computed(() => this.page().totalCredit);
  protected readonly isOwner = computed(() => this.auth.user()?.role === "OWNER");

  protected balanceLabel(balance: string): string {
    return vendorBalanceLabel(balance);
  }

  protected balanceAmount(balance: string): string {
    return vendorBalanceAmount(balance);
  }

  protected balanceInWords(balance: string): string {
    return vendorBalanceInWords(balance);
  }

  protected balanceState(balance: string) {
    return vendorBalanceState(balance);
  }

  protected onFiltersChange(filters: VendorLedgerFilters): void {
    this.filters.set(filters);
    this.pageIndex.set(0);
  }

  protected onSortChange(sort: LedgerSort): void {
    this.sort.set(sort);
  }

  protected onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  protected openVoidDialog(entry: VendorLedgerEntry): void {
    if (!this.isOwner()) {
      this.snackBar.open("Only the store owner can void a payment.", "Dismiss", {
        duration: 3000,
      });
      return;
    }
    this.voidingEntry.set(entry);
    this.voidReason.set("");
    this.voidError.set("");
  }

  protected closeVoidDialog(): void {
    this.voidingEntry.set(null);
    this.voidReason.set("");
    this.voidError.set("");
  }

  protected async confirmVoid(): Promise<void> {
    const entry = this.voidingEntry();
    const v = this.vendor();
    if (!entry || !entry.paymentId || !v) return;

    const reason = this.voidReason().trim();
    if (!reason) {
      this.voidError.set("Void reason is required to explain this correction.");
      return;
    }

    this.isVoiding.set(true);
    this.voidError.set("");
    try {
      await this.vendors.voidPayment(entry.paymentId, v.id, reason);
      this.snackBar.open(
        "Payment voided successfully. Compensating reversal entry posted.",
        "Dismiss",
        { duration: 4000 },
      );
      this.closeVoidDialog();
    } catch (err) {
      this.voidError.set(
        err instanceof Error ? err.message : "Failed to void payment.",
      );
    } finally {
      this.isVoiding.set(false);
    }
  }
}
