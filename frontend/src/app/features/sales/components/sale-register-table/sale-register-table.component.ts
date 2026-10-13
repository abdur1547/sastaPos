import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { DatePipe, NgTemplateOutlet } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";

import {
  PaymentMethod,
  SaleListItem,
  SaleSort,
  SaleSortField,
} from "../../models/sale-register.model";

const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK: "Bank",
  CREDIT: "Credit",
};

@Component({
  selector: "app-sale-register-table",
  imports: [DatePipe, NgTemplateOutlet, MatIconModule, MatProgressBarModule],
  templateUrl: "./sale-register-table.component.html",
  styleUrl: "./sale-register-table.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaleRegisterTableComponent {
  readonly sales = input<readonly SaleListItem[]>([]);
  readonly loading = input(false);
  readonly sort = input.required<SaleSort>();
  readonly sortChange = output<SaleSort>();
  readonly selectSale = output<SaleListItem>();

  protected readonly columnCount = 10;

  protected toggleSort(field: SaleSortField): void {
    const current = this.sort();
    if (current.field === field) {
      this.sortChange.emit({
        field,
        direction: current.direction === "asc" ? "desc" : "asc",
      });
      return;
    }
    // Text reads naturally A→Z; dates and amounts are usually wanted largest/newest first.
    this.sortChange.emit({
      field,
      direction: field === "invoiceNumber" ? "asc" : "desc",
    });
  }

  protected ariaSort(field: SaleSortField): "ascending" | "descending" | "none" {
    const current = this.sort();
    if (current.field !== field) {
      return "none";
    }
    return current.direction === "asc" ? "ascending" : "descending";
  }

  protected sortIcon(field: SaleSortField): string {
    const current = this.sort();
    if (current.field !== field) {
      return "unfold_more";
    }
    return current.direction === "asc" ? "arrow_upward" : "arrow_downward";
  }

  protected methods(sale: SaleListItem): string {
    if (sale.paymentMethods.length === 0) {
      return sale.saleType === "CREDIT" ? "On account" : "—";
    }
    return sale.paymentMethods.map((method) => METHOD_LABELS[method]).join(" + ");
  }

  protected isDue(sale: SaleListItem): boolean {
    return sale.status === "COMPLETED" && Number(sale.remaining) > 0;
  }
}
