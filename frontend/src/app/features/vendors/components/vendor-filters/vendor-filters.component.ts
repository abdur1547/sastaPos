import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  output,
} from "@angular/core";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatButtonModule } from "@angular/material/button";
import { debounceTime, distinctUntilChanged } from "rxjs";

import {
  BalanceStateFilter,
  DEFAULT_VENDOR_FILTERS,
  TaxRegistrationFilter,
  VendorFilters,
  VendorStatusFilter,
} from "../../vendor-query.model";

@Component({
  selector: "app-vendor-filters",
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
  ],
  templateUrl: "./vendor-filters.component.html",
  styleUrl: "./vendor-filters.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VendorFiltersComponent implements OnInit {
  private readonly fb = inject(FormBuilder);

  readonly filtersChange = output<VendorFilters>();

  protected readonly form = this.fb.nonNullable.group({
    search: [DEFAULT_VENDOR_FILTERS.search],
    status: [DEFAULT_VENDOR_FILTERS.status as VendorStatusFilter],
    salesTaxRegistrationStatus: [
      DEFAULT_VENDOR_FILTERS.salesTaxRegistrationStatus as TaxRegistrationFilter,
    ],
    balanceState: [
      DEFAULT_VENDOR_FILTERS.balanceState as BalanceStateFilter,
    ],
  });

  ngOnInit(): void {
    this.form.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged())
      .subscribe((val) => {
        this.filtersChange.emit({
          search: val.search ?? "",
          status: val.status ?? "ALL",
          salesTaxRegistrationStatus: val.salesTaxRegistrationStatus ?? "ALL",
          balanceState: val.balanceState ?? "ALL",
          sortField: DEFAULT_VENDOR_FILTERS.sortField,
          sortDirection: DEFAULT_VENDOR_FILTERS.sortDirection,
        });
      });
  }

  protected reset(): void {
    this.form.reset(DEFAULT_VENDOR_FILTERS);
  }
}
