import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";

import { SaleRegisterSummary } from "../../models/sale-register.model";

/** Totals for everything the current filters match, not just the visible page. */
@Component({
  selector: "app-sale-summary-strip",
  imports: [MatIconModule],
  template: `
    <section class="strip" aria-label="Sales summary for the current filters">
      <div class="card is-primary">
        <span class="label">Net sales</span>
        <span class="value">Rs {{ summary().netSales }}</span>
        <span class="hint">{{ summary().saleCount }} sale{{ summary().saleCount === 1 ? '' : 's' }}</span>
      </div>
      <div class="card">
        <span class="label">Collected</span>
        <span class="value">Rs {{ summary().collected }}</span>
        <span class="hint">Cash and bank received</span>
      </div>
      <div class="card" [class.is-warning]="hasOutstanding()">
        <span class="label">Payment due</span>
        <span class="value">Rs {{ summary().outstanding }}</span>
        <span class="hint">Still owed by customers</span>
      </div>
      <div class="card">
        <span class="label">Average sale</span>
        <span class="value">Rs {{ summary().averageSale }}</span>
        <span class="hint">Per completed sale</span>
      </div>
      <div class="card" [class.is-danger]="summary().voidedCount > 0">
        <span class="label">Voided</span>
        <span class="value">{{ summary().voidedCount }}</span>
        <span class="hint">Rs {{ summary().voidedAmount }} reversed</span>
      </div>
    </section>
  `,
  styles: `
    .strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 12px;
    }

    .card {
      display: grid;
      gap: 2px;
      padding: 12px 16px;
      border: 1px solid var(--border-subtle);
      border-left: 4px solid var(--border-subtle);
      border-radius: 8px;
      background: #ffffff;
    }

    .card.is-primary { border-left-color: var(--accent-teal); }
    .card.is-warning { border-left-color: var(--accent-amber); }
    .card.is-danger { border-left-color: var(--accent-coral); }

    .label {
      color: var(--ink-muted);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .value {
      color: var(--ink-strong);
      font-size: 22px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }

    .hint {
      color: var(--ink-muted);
      font-size: 12px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaleSummaryStripComponent {
  readonly summary = input.required<SaleRegisterSummary>();

  protected hasOutstanding(): boolean {
    return Number(this.summary().outstanding) > 0;
  }
}
