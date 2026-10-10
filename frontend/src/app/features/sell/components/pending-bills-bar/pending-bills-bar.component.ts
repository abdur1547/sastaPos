import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";
import { MatChipsModule } from "@angular/material/chips";

import { PendingBill } from "../../models/sell.model";

@Component({
  selector: "app-pending-bills-bar",
  imports: [MatChipsModule],
  templateUrl: "./pending-bills-bar.component.html",
  styleUrl: "./pending-bills-bar.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PendingBillsBarComponent {
  readonly bills = input<readonly PendingBill[]>([]);
  readonly resume = output<string>();
  readonly remove = output<string>();
}
