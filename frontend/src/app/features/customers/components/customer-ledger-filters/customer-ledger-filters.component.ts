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

import { parseLocalDate } from "../../../sales/domain/sale-date-range";
import {
  CUSTOMER_LEDGER_TYPES,
  CustomerLedgerFilters,
  DEFAULT_LEDGER_FILTERS,
  LEDGER_DATE_PRESET_LABELS,
  LEDGER_TYPE_LABELS,
  LedgerDatePreset,
  LedgerEntryType,
} from "../../customer-ledger.model";

@Component({
  selector: "app-customer-ledger-filters",
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
  templateUrl: "./customer-ledger-filters.component.html",
  styleUrl: "./customer-ledger-filters.component.scss",
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerLedgerFiltersComponent implements OnInit {
  readonly initialFilters = input<CustomerLedgerFilters>(DEFAULT_LEDGER_FILTERS);
  readonly filtersChange = output<CustomerLedgerFilters>();

  protected readonly presets = Object.entries(LEDGER_DATE_PRESET_LABELS) as [
    LedgerDatePreset,
    string,
  ][];
  protected readonly types = CUSTOMER_LEDGER_TYPES.map(
    (type) => [type, LEDGER_TYPE_LABELS[type]] as const,
  );

  private readonly formBuilder = inject(FormBuilder).nonNullable;
  protected readonly form = this.formBuilder.group({ ...DEFAULT_LEDGER_FILTERS });

  /** Date objects for the range picker; mirrored into the `YYYY-MM-DD` customFrom/customTo filters. */
  protected readonly customRange = new FormGroup({
    start: new FormControl<Date | null>(null),
    end: new FormControl<Date | null>(null),
  });

  protected readonly filters = signal<CustomerLedgerFilters>(DEFAULT_LEDGER_FILTERS);

  protected readonly isCustom = computed(() => this.filters().datePreset === "custom");

  /** Search is not counted: it is visible in its own field. */
  protected readonly activeFilterCount = computed(() => {
    const current = this.filters();
    const defaults = DEFAULT_LEDGER_FILTERS;
    return [
      current.datePreset !== defaults.datePreset,
      current.type !== defaults.type,
      current.direction !== defaults.direction,
      current.status !== defaults.status,
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

  protected toggleType(type: LedgerEntryType): void {
    this.form.patchValue({ type: this.filters().type === type ? "ALL" : type });
  }

  protected toggleVoided(): void {
    this.form.patchValue({ status: this.filters().status === "VOIDED" ? "ALL" : "VOIDED" });
  }

  protected toggleThisMonth(): void {
    this.form.patchValue({
      datePreset: this.filters().datePreset === "thisMonth" ? "all" : "thisMonth",
    });
  }

  protected reset(): void {
    this.form.reset(DEFAULT_LEDGER_FILTERS);
    this.syncCustomRange();
  }

  private syncCustomRange(): void {
    const { customFrom, customTo } = this.form.getRawValue();
    this.customRange.setValue(
      { start: parseLocalDate(customFrom), end: parseLocalDate(customTo) },
      { emitEvent: false },
    );
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
