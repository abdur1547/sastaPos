import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";
import { DatePipe } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatMenuModule } from "@angular/material/menu";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatTooltipModule } from "@angular/material/tooltip";
import { RouterLink } from "@angular/router";

import {
  BalanceState,
  Vendor,
  vendorBalanceAmount,
  vendorBalanceLabel,
  vendorBalanceState,
} from "../../vendor.model";
import { vendorBalanceInWords } from "../../../../shared/utils/number-to-words";

@Component({
  selector: "app-vendor-table",
  imports: [
    DatePipe,
    RouterLink,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
  templateUrl: "./vendor-table.component.html",
  styleUrl: "./vendor-table.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VendorTableComponent {
  readonly vendors = input.required<readonly Vendor[]>();
  readonly loading = input(false);
  readonly selectable = input(true);

  readonly selectVendor = output<Vendor>();
  readonly deleteVendor = output<Vendor>();

  protected balanceState(vendor: Vendor): BalanceState {
    return vendorBalanceState(vendor.accountBalance);
  }

  protected balanceAmount(vendor: Vendor): string {
    return vendorBalanceAmount(vendor.accountBalance);
  }

  protected balanceLabel(vendor: Vendor): string {
    return vendorBalanceLabel(vendor.accountBalance);
  }

  protected balanceInWords(vendor: Vendor): string {
    return vendorBalanceInWords(vendor.accountBalance);
  }
}

