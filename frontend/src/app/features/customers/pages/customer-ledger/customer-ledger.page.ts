import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";

import { CustomerService } from "../../customer.service";
import { customerBalanceLabel } from "../../customer-payment.model";
import { watchCustomerPage } from "../customer-page-state";

@Component({
  selector: "app-customer-ledger-page",
  imports: [RouterLink, MatButtonModule, MatIconModule],
  templateUrl: "./customer-ledger.page.html",
  styleUrl: "../customer-account.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerLedgerPage {
  protected readonly balanceLabel = customerBalanceLabel;
  protected readonly state = toSignal(
    watchCustomerPage(inject(ActivatedRoute), inject(CustomerService)),
  );
}
