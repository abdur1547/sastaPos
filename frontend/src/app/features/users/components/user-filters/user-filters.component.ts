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

import { DEFAULT_USER_FILTERS, UserFilters } from "../../user-query.model";

@Component({
  selector: "app-user-filters",
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: "./user-filters.component.html",
  styleUrl: "./user-filters.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserFiltersComponent {
  readonly filtersChange = output<UserFilters>();

  private readonly formBuilder = inject(FormBuilder).nonNullable;
  protected readonly form = this.formBuilder.group({
    ...DEFAULT_USER_FILTERS,
  });

  protected readonly filters = toSignal(
    this.form.valueChanges.pipe(
      startWith(this.form.getRawValue()),
      map(() => this.form.getRawValue() as UserFilters),
    ),
    { initialValue: DEFAULT_USER_FILTERS },
  );

  protected readonly activeFilterCount = computed(() =>
    this.filters().role !== DEFAULT_USER_FILTERS.role ? 1 : 0,
  );

  constructor() {
    this.form.valueChanges
      .pipe(debounceTime(250), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.filtersChange.emit(this.form.getRawValue()));
  }

  protected toggleSortDirection(): void {
    this.form.patchValue({
      sortDirection: this.form.controls.sortDirection.value === "asc" ? "desc" : "asc",
    });
  }

  protected reset(): void {
    this.form.reset(DEFAULT_USER_FILTERS);
  }
}
