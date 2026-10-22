import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { DatePipe, NgTemplateOutlet } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";

import {
  CustomerLedgerEntry,
  LedgerSort,
  LedgerSortField,
  ledgerTypeLabel,
} from "../../customer-ledger.model";

/** Text columns read naturally A→Z; dates and amounts are usually wanted largest/newest first. */
const ASCENDING_FIRST: ReadonlySet<LedgerSortField> = new Set([
  "type",
  "referenceNumber",
  "description",
]);

@Component({
  selector: "app-customer-ledger-table",
  imports: [DatePipe, NgTemplateOutlet, MatIconModule, MatProgressBarModule],
  templateUrl: "./customer-ledger-table.component.html",
  styleUrl: "./customer-ledger-table.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerLedgerTableComponent {
  readonly entries = input<readonly CustomerLedgerEntry[]>([]);
  readonly loading = input(false);
  readonly sort = input.required<LedgerSort>();
  readonly sortChange = output<LedgerSort>();
  /** Emits the sale id of a sale-linked entry. */
  readonly openSale = output<string>();

  protected readonly columnCount = 8;
  protected readonly typeLabel = ledgerTypeLabel;

  protected toggleSort(field: LedgerSortField): void {
    const current = this.sort();
    if (current.field === field) {
      this.sortChange.emit({
        field,
        direction: current.direction === "asc" ? "desc" : "asc",
      });
      return;
    }
    this.sortChange.emit({
      field,
      direction: ASCENDING_FIRST.has(field) ? "asc" : "desc",
    });
  }

  protected ariaSort(field: LedgerSortField): "ascending" | "descending" | "none" {
    const current = this.sort();
    if (current.field !== field) {
      return "none";
    }
    return current.direction === "asc" ? "ascending" : "descending";
  }

  protected sortIcon(field: LedgerSortField): string {
    const current = this.sort();
    if (current.field !== field) {
      return "unfold_more";
    }
    return current.direction === "asc" ? "arrow_upward" : "arrow_downward";
  }

  protected open(entry: CustomerLedgerEntry, event?: Event): void {
    if (!entry.saleId) {
      return;
    }
    event?.preventDefault();
    this.openSale.emit(entry.saleId);
  }

  protected isCreditBalance(entry: CustomerLedgerEntry): boolean {
    return entry.balanceAfter.startsWith("-");
  }

  protected balanceNote(entry: CustomerLedgerEntry): string {
    if (/^-?0\.00$/.test(entry.balanceAfter)) {
      return "Settled";
    }
    return this.isCreditBalance(entry) ? "Credit" : "Owes";
  }

  protected absolute(amount: string): string {
    return amount.replace(/^-/, "");
  }
}
