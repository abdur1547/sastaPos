import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { DatePipe } from "@angular/common";
import { MatProgressBarModule } from "@angular/material/progress-bar";

import { CustomerListItem } from "../../customer-query.model";

@Component({
  selector: "app-customer-table",
  imports: [DatePipe, MatProgressBarModule],
  templateUrl: "./customer-table.component.html",
  styleUrl: "./customer-table.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerTableComponent {
  readonly selectable = input(true);
  readonly customers = input<readonly CustomerListItem[]>([]);
  readonly loading = input(false);
  readonly selectCustomer = output<CustomerListItem>();

  protected balanceState(customer: CustomerListItem): "owes" | "credit" | "settled" {
    const balance = Number(customer.accountBalance);
    if (balance > 0) {
      return "owes";
    }
    return balance < 0 ? "credit" : "settled";
  }

  protected absoluteBalance(customer: CustomerListItem): string {
    return customer.accountBalance.replace("-", "");
  }
}
