import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";
import { DatePipe, NgTemplateOutlet } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatTooltipModule } from "@angular/material/tooltip";

import {
  LedgerSort,
  LedgerSortField,
  ledgerTypeLabel,
  VendorLedgerEntry,
} from "../../vendor-ledger.model";
import { vendorBalanceInWords } from "../../../../shared/utils/number-to-words";

@Component({
  selector: "app-vendor-ledger-table",
  imports: [
    DatePipe,
    NgTemplateOutlet,
    MatIconModule,
    MatButtonModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
  templateUrl: "./vendor-ledger-table.component.html",
  styleUrl: "./vendor-ledger-table.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VendorLedgerTableComponent {
  readonly entries = input.required<readonly VendorLedgerEntry[]>();
  readonly loading = input(false);
  readonly sort = input<LedgerSort>({ field: "occurredAt", direction: "desc" });

  readonly sortChange = output<LedgerSort>();
  readonly voidEntry = output<VendorLedgerEntry>();

  protected readonly columnCount = 9;

  protected typeLabel(type: string): string {
    return ledgerTypeLabel(type);
  }

  protected isStoreOwes(entry: VendorLedgerEntry): boolean {
    return entry.balanceAfter.startsWith("-");
  }

  protected absolute(value: string): string {
    return value.startsWith("-") ? value.slice(1) : value;
  }

  protected balanceNote(entry: VendorLedgerEntry): string {
    if (entry.balanceAfter === "0.00" || entry.balanceAfter === "0") {
      return "Settled";
    }
    return this.isStoreOwes(entry) ? "We owe" : "Advance";
  }

  protected balanceInWords(entry: VendorLedgerEntry): string {
    return vendorBalanceInWords(entry.balanceAfter);
  }

  protected toggleSort(field: LedgerSortField): void {
    const current = this.sort();
    if (current.field === field) {
      this.sortChange.emit({
        field,
        direction: current.direction === "asc" ? "desc" : "asc",
      });
    } else {
      this.sortChange.emit({ field, direction: "desc" });
    }
  }

  protected sortIcon(field: LedgerSortField): string {
    const current = this.sort();
    if (current.field !== field) return "unfold_more";
    return current.direction === "asc" ? "arrow_upward" : "arrow_downward";
  }

  protected ariaSort(field: LedgerSortField): "ascending" | "descending" | "none" {
    const current = this.sort();
    if (current.field !== field) return "none";
    return current.direction === "asc" ? "ascending" : "descending";
  }
}

