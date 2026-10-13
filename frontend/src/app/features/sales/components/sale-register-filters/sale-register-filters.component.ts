import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { provideNativeDateAdapter } from "@angular/material/core";
import { MatButtonModule } from "@angular/material/button";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { debounceTime } from "rxjs";

import {
  CashierOption,
  DEFAULT_SALE_REGISTER_FILTERS,
  DatePreset,
  SaleRegisterFilters,
} from "../../models/sale-register.model";
import { parseLocalDate } from "../../domain/sale-date-range";

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 days",
  thisMonth: "This month",
  lastMonth: "Last month",
  all: "All time",
  custom: "Custom range",
};

@Component({
  selector: "app-sale-register-filters",
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: "./sale-register-filters.component.html",
  styleUrl: "./sale-register-filters.component.scss",
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaleRegisterFiltersComponent implements OnInit {
  /** Restores filters when returning to the register. */
  readonly initialFilters = input<SaleRegisterFilters>(DEFAULT_SALE_REGISTER_FILTERS);
  readonly cashiers = input<readonly CashierOption[]>([]);
  readonly filtersChange = output<SaleRegisterFilters>();

  protected readonly presets = Object.entries(DATE_PRESET_LABELS) as [DatePreset, string][];

  private readonly formBuilder = inject(FormBuilder).nonNullable;
  protected readonly form = this.formBuilder.group({
    ...DEFAULT_SALE_REGISTER_FILTERS,
  });

  /** Date objects for the range picker; mirrored into the `YYYY-MM-DD` customFrom/customTo filters. */
  protected readonly customRange = new FormGroup({
    start: new FormControl<Date | null>(null),
    end: new FormControl<Date | null>(null),
  });

  protected readonly filters = signal<SaleRegisterFilters>(DEFAULT_SALE_REGISTER_FILTERS);

  protected readonly isCustom = computed(() => this.filters().datePreset === "custom");

  /** Search is not counted: it is visible in its own field. */
  protected readonly activeFilterCount = computed(() => {
    const current = this.filters();
    const defaults = DEFAULT_SALE_REGISTER_FILTERS;
    return [
      current.status !== defaults.status,
      current.datePreset !== defaults.datePreset,
      current.saleType !== defaults.saleType,
      current.paymentMethod !== defaults.paymentMethod,
      current.cashierId !== defaults.cashierId,
      current.outstandingOnly,
    ].filter(Boolean).length;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    this.form.valueChanges
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => this.filters.set(this.form.getRawValue()));
    this.form.valueChanges
      .pipe(debounceTime(250), takeUntilDestroyed(destroyRef))
      .subscribe(() => this.filtersChange.emit(this.form.getRawValue()));
    this.customRange.valueChanges
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(({ start, end }) =>
        this.form.patchValue({ customFrom: toDateText(start), customTo: toDateText(end) }),
      );
  }

  ngOnInit(): void {
    this.form.setValue({ ...this.initialFilters() }, { emitEvent: false });
    this.filters.set(this.form.getRawValue());
    this.syncCustomRange();
  }

  private syncCustomRange(): void {
    const { customFrom, customTo } = this.form.getRawValue();
    this.customRange.setValue(
      { start: parseLocalDate(customFrom), end: parseLocalDate(customTo) },
      { emitEvent: false },
    );
  }

  protected toggleOutstanding(): void {
    this.form.patchValue({ outstandingOnly: !this.filters().outstandingOnly });
  }

  protected toggleVoided(): void {
    this.form.patchValue({
      status: this.filters().status === "VOIDED" ? "POSTED" : "VOIDED",
    });
  }

  protected selectPreset(preset: DatePreset): void {
    this.form.patchValue({ datePreset: preset });
  }

  protected reset(): void {
    this.form.reset(DEFAULT_SALE_REGISTER_FILTERS);
    this.syncCustomRange();
  }
}

function toDateText(date: Date | null | undefined): string {
  if (!date) {
    return "";
  }
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
