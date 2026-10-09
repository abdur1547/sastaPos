import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  output,
} from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { debounceTime, map, startWith } from "rxjs";

import {
  CustomerFilters,
  DEFAULT_CUSTOMER_FILTERS,
} from "../../customer-query.model";

@Component({
  selector: "app-customer-filters",
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: "./customer-filters.component.html",
  styleUrl: "./customer-filters.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerFiltersComponent {
  readonly filtersChange = output<CustomerFilters>();

  private readonly formBuilder = inject(FormBuilder).nonNullable;
  protected readonly form = this.formBuilder.group({
    ...DEFAULT_CUSTOMER_FILTERS,
  });

  protected readonly filters = toSignal(
    this.form.valueChanges.pipe(
      startWith(this.form.getRawValue()),
      map(() => this.form.getRawValue() as CustomerFilters),
    ),
    { initialValue: DEFAULT_CUSTOMER_FILTERS },
  );

  protected readonly activeFilterCount = computed(() => {
    const current = this.filters();
    return [
      current.status !== DEFAULT_CUSTOMER_FILTERS.status,
      current.balance !== "ANY",
    ].filter(Boolean).length;
  });

  protected readonly isOwesPreset = computed(() => this.filters().balance === "OWES");
  protected readonly isCreditPreset = computed(() => this.filters().balance === "CREDIT");

  constructor() {
    this.form.valueChanges
      .pipe(debounceTime(250), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.filtersChange.emit(this.form.getRawValue()));
  }

  protected toggleBalancePreset(balance: "OWES" | "CREDIT"): void {
    this.form.patchValue({
      balance: this.filters().balance === balance ? "ANY" : balance,
    });
  }

  protected toggleSortDirection(): void {
    this.form.patchValue({
      sortDirection: this.form.controls.sortDirection.value === "asc" ? "desc" : "asc",
    });
  }

  protected reset(): void {
    this.form.reset(DEFAULT_CUSTOMER_FILTERS);
  }
}
