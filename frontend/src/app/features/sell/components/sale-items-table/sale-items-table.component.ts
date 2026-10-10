import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";
import { FormArray, ReactiveFormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";

import { PricedLine } from "../../domain/sale-calculator";
import { SellLineGroup } from "../../state/sell-form.store";

@Component({
  selector: "app-sale-items-table",
  imports: [ReactiveFormsModule, MatIconModule],
  templateUrl: "./sale-items-table.component.html",
  styleUrl: "./sale-items-table.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaleItemsTableComponent {
  /** One form group per cart line; quantities are edited through their controls. */
  readonly lines = input.required<FormArray<SellLineGroup>>();
  /** Priced lines, in the same order as `lines`. */
  readonly priced = input<readonly PricedLine[]>([]);
  readonly removeItem = output<string>();
}
