import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatIconModule } from "@angular/material/icon";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatNativeDateModule } from "@angular/material/core";
import { debounceTime, distinctUntilChanged } from "rxjs";

import {
  LEDGER_DATE_PRESET_LABELS,
  LEDGER_TYPE_LABELS,
  LedgerDatePreset,
  LedgerDirection,
  LedgerEntryType,
  LedgerStatusFilter,
} from "../../../customers/customer-ledger.model";
import {
  DEFAULT_VENDOR_LEDGER_FILTERS,
  VENDOR_LEDGER_TYPES,
  VendorLedgerFilters,
} from "../../vendor-ledger.model";

@Component({
  selector: "app-vendor-ledger-filters",
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonToggleModule,
    MatIconModule,
    MatDatepickerModule,
    MatNativeDateModule,
  ],
  templateUrl: "./vendor-ledger-filters.component.html",
  styleUrl: "./vendor-ledger-filters.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VendorLedgerFiltersComponent implements OnInit {
  private readonly fb = inject(FormBuilder);

  readonly initialFilters = input<VendorLedgerFilters>(
    DEFAULT_VENDOR_LEDGER_FILTERS,
  );
  readonly filtersChange = output<VendorLedgerFilters>();

  protected readonly presets = Object.entries(LEDGER_DATE_PRESET_LABELS) as [
    LedgerDatePreset,
    string,
  ][];
  protected readonly types = VENDOR_LEDGER_TYPES.map(
    (t) => [t, LEDGER_TYPE_LABELS[t]] as [LedgerEntryType, string],
  );

  protected readonly isCustom = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    search: [DEFAULT_VENDOR_LEDGER_FILTERS.search],
    direction: [DEFAULT_VENDOR_LEDGER_FILTERS.direction as LedgerDirection | "ALL"],
    datePreset: [DEFAULT_VENDOR_LEDGER_FILTERS.datePreset as LedgerDatePreset],
    type: [DEFAULT_VENDOR_LEDGER_FILTERS.type as LedgerEntryType | "ALL"],
    status: [DEFAULT_VENDOR_LEDGER_FILTERS.status as LedgerStatusFilter],
  });

  protected readonly customRange = this.fb.group({
    start: [null as Date | null],
    end: [null as Date | null],
  });

  protected readonly activeFilterCount = computed(() => {
    const val = this.form.getRawValue();
    const defaults = DEFAULT_VENDOR_LEDGER_FILTERS;
    return [
      val.datePreset !== defaults.datePreset,
      val.type !== defaults.type,
      val.direction !== defaults.direction,
      val.status !== defaults.status,
    ].filter(Boolean).length;
  });

  protected reset(): void {
    this.form.reset(DEFAULT_VENDOR_LEDGER_FILTERS);
    this.customRange.reset({ start: null, end: null });
    this.emitFilters();
  }

  ngOnInit(): void {
    const init = this.initialFilters();
    this.form.patchValue(init);
    this.isCustom.set(init.datePreset === "custom");

    this.form.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged())
      .subscribe(() => this.emitFilters());

    this.customRange.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged())
      .subscribe(() => {
        if (this.isCustom()) {
          this.emitFilters();
        }
      });

    this.form.controls.datePreset.valueChanges.subscribe((preset) => {
      this.isCustom.set(preset === "custom");
    });
  }

  protected toggleThisMonth(): void {
    const current = this.form.controls.datePreset.value;
    this.form.controls.datePreset.setValue(
      current === "thisMonth" ? "all" : "thisMonth",
    );
  }

  protected toggleType(type: LedgerEntryType): void {
    const current = this.form.controls.type.value;
    this.form.controls.type.setValue(current === type ? "ALL" : type);
  }

  protected toggleVoided(): void {
    const current = this.form.controls.status.value;
    this.form.controls.status.setValue(
      current === "VOIDED" ? "ALL" : "VOIDED",
    );
  }

  private emitFilters(): void {
    const val = this.form.getRawValue();
    const range = this.customRange.getRawValue();

    const customFrom =
      val.datePreset === "custom" && range.start
        ? range.start.toISOString().split("T")[0]
        : "";
    const customTo =
      val.datePreset === "custom" && range.end
        ? range.end.toISOString().split("T")[0]
        : "";

    this.filtersChange.emit({
      search: val.search,
      direction: val.direction,
      datePreset: val.datePreset,
      customFrom,
      customTo,
      type: val.type,
      status: val.status,
    });
  }
}

