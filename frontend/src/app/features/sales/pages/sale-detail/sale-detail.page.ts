import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { DatePipe } from "@angular/common";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { MatDialog } from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MatTooltipModule } from "@angular/material/tooltip";
import { catchError, firstValueFrom, map, of, switchMap, timer } from "rxjs";

import {
  VoidSaleDialogComponent,
  VoidSaleDialogData,
} from "../../components/void-sale-dialog/void-sale-dialog.component";
import { SaleDetail } from "../../models/sale-detail.model";
import { PaymentMethod } from "../../models/sale-register.model";
import { SaleRegisterService } from "../../sale-register.service";

type DetailState =
  | { readonly status: "loading" }
  | { readonly status: "missing" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly sale: SaleDetail };

const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK: "Bank",
  CREDIT: "Credit",
};

const MOVEMENT_LABELS: Record<string, string> = {
  SALE: "Sold",
  ADJUSTMENT_IN: "Returned to stock",
  ADJUSTMENT_OUT: "Removed from stock",
};

const LEDGER_LABELS: Record<string, string> = {
  SALE: "Sale charged",
  PAYMENT: "Payment received",
  ADJUSTMENT: "Adjustment",
};

/**
 * A posted sale is an accounting document: it is shown read-only, and the only way to change it is
 * a void, which appends reversing entries instead of editing the original.
 */
@Component({
  selector: "app-sale-detail-page",
  imports: [DatePipe, RouterLink, MatIconModule, MatProgressBarModule, MatTooltipModule],
  templateUrl: "./sale-detail.page.html",
  styleUrl: "./sale-detail.page.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaleDetailPage {
  private readonly sales = inject(SaleRegisterService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly state = toSignal(
    inject(ActivatedRoute).paramMap.pipe(
      map((params) => params.get("id") ?? ""),
      switchMap((id) => {
        try {
          return this.sales.watchDetail(id).pipe(
            map((sale): DetailState => (sale ? { status: "ready", sale } : { status: "missing" })),
            catchError((error: unknown) =>
              of<DetailState>({
                status: "error",
                message: error instanceof Error ? error.message : "Could not load this sale.",
              }),
            ),
          );
        } catch (error) {
          return of<DetailState>({
            status: "error",
            message: error instanceof Error ? error.message : "Could not load this sale.",
          });
        }
      }),
    ),
    { initialValue: { status: "loading" } as DetailState },
  );

  protected readonly sale = computed(() => {
    const state = this.state();
    return state.status === "ready" ? state.sale : null;
  });

  /** Re-evaluated every minute so a cashier's "today only" window closes on its own at midnight. */
  private readonly clock = toSignal(timer(0, 60_000).pipe(map(() => new Date())), {
    initialValue: new Date(),
  });

  protected readonly voidDecision = computed(() => {
    const sale = this.sale();
    return sale ? this.sales.canVoid(sale.header, this.clock()) : null;
  });

  protected readonly voiding = signal(false);

  protected readonly itemCount = computed(() => this.sale()?.items.length ?? 0);
  protected readonly hasAuditTrail = computed(() => {
    const sale = this.sale();
    return !!sale && (sale.stockMovements.length > 0 || sale.ledgerEntries.length > 0);
  });

  protected methodLabel(method: PaymentMethod): string {
    return METHOD_LABELS[method];
  }

  protected movementLabel(type: string): string {
    return MOVEMENT_LABELS[type] ?? type;
  }

  protected ledgerLabel(type: string): string {
    return LEDGER_LABELS[type] ?? type;
  }

  protected isPositive(value: string): boolean {
    return Number(value) > 0;
  }

  protected async openVoidDialog(): Promise<void> {
    const sale = this.sale();
    if (!sale || !this.voidDecision()?.allowed || this.voiding()) {
      return;
    }
    this.voiding.set(true);
    try {
      const data: VoidSaleDialogData = {
        sale,
        confirm: (reason) => this.sales.voidSale(sale.header, reason),
      };
      const voided = await firstValueFrom(
        this.dialog
          .open<VoidSaleDialogComponent, VoidSaleDialogData, boolean>(VoidSaleDialogComponent, {
            data,
            autoFocus: "first-tabbable",
            width: "560px",
          })
          .afterClosed(),
      );
      if (voided) {
        this.snackBar.open(
          `Sale ${sale.header.invoiceNumber} voided. Stock and balances were reversed.`,
          "Dismiss",
          { duration: 4000 },
        );
      }
    } finally {
      this.voiding.set(false);
    }
  }
}
