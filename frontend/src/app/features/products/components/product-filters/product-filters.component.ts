import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
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

import { UnitOfMeasureOption } from "../../product-lookup.model";
import {
  DEFAULT_PRODUCT_FILTERS,
  ProductFilters,
} from "../../product-query.model";

const LOW_STOCK_THRESHOLD = "5";

@Component({
  selector: "app-product-filters",
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: "./product-filters.component.html",
  styleUrl: "./product-filters.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductFiltersComponent {
  readonly unitsOfMeasure = input<readonly UnitOfMeasureOption[]>([]);
  readonly filtersChange = output<ProductFilters>();

  private readonly formBuilder = inject(FormBuilder).nonNullable;
  protected readonly form = this.formBuilder.group({
    ...DEFAULT_PRODUCT_FILTERS,
  });

  protected readonly filters = toSignal(
    this.form.valueChanges.pipe(
      startWith(this.form.getRawValue()),
      map(() => this.form.getRawValue() as ProductFilters),
    ),
    { initialValue: DEFAULT_PRODUCT_FILTERS },
  );

  protected readonly activeFilterCount = computed(() => {
    const current = this.filters();
    const defaults = DEFAULT_PRODUCT_FILTERS;
    return [
      current.status !== defaults.status,
      current.stockOperator !== "ANY" && current.stockValue !== "",
      current.minPrice !== "" || current.maxPrice !== "",
      current.unitsOfMeasureId !== "",
    ].filter(Boolean).length;
  });

  protected readonly isLowStockPreset = computed(
    () =>
      this.filters().stockOperator === "LTE" &&
      this.filters().stockValue === LOW_STOCK_THRESHOLD,
  );
  protected readonly isOutOfStockPreset = computed(
    () =>
      this.filters().stockOperator === "EQ" &&
      this.filters().stockValue === "0",
  );

  constructor() {
    this.form.valueChanges
      .pipe(debounceTime(250), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.filtersChange.emit(this.form.getRawValue()));
  }

  protected toggleStockPreset(operator: "LTE" | "EQ", value: string): void {
    const active = operator === "LTE" ? this.isLowStockPreset() : this.isOutOfStockPreset();
    this.form.patchValue(
      active
        ? { stockOperator: "ANY", stockValue: "" }
        : { stockOperator: operator, stockValue: value },
    );
  }

  protected toggleSortDirection(): void {
    this.form.patchValue({
      sortDirection: this.form.controls.sortDirection.value === "asc" ? "desc" : "asc",
    });
  }

  protected reset(): void {
    this.form.reset(DEFAULT_PRODUCT_FILTERS);
  }

  protected readonly lowStockThreshold = LOW_STOCK_THRESHOLD;
}
