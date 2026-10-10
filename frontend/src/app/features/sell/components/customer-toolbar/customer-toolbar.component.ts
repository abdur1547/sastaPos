import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from "@angular/material/autocomplete";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { startWith } from "rxjs";

import { SellCustomer } from "../../models/sell.model";

@Component({
  selector: "app-customer-toolbar",
  imports: [
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: "./customer-toolbar.component.html",
  styleUrl: "./customer-toolbar.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerToolbarComponent {
  readonly customers = input<readonly SellCustomer[]>([]);
  /** The customer currently attached to the sale; keeps the field in sync when set from outside. */
  readonly customer = input<SellCustomer | null>(null);
  readonly customerSelected = output<SellCustomer>();
  readonly customerCleared = output<void>();
  readonly addCustomer = output<void>();

  protected readonly search = new FormControl<string | SellCustomer>("", {
    nonNullable: true,
  });

  private readonly searchValue = toSignal(
    this.search.valueChanges.pipe(startWith(this.search.value)),
    {
      initialValue: "",
    },
  );

  protected readonly filteredCustomers = computed(() => {
    const value = this.searchValue();
    const term = (typeof value === "string" ? value : value.name)
      .trim()
      .toLowerCase();
    if (!term) {
      return this.customers();
    }
    return this.customers().filter(
      (customer) =>
        customer.name.toLowerCase().includes(term) ||
        (customer.phoneNumber ?? "").includes(term),
    );
  });

  constructor() {
    effect(() => {
      const selected = this.customer();
      this.search.setValue(selected ?? "", { emitEvent: false });
    });
    this.search.valueChanges.subscribe((value) => {
      if (value === "" && this.customer()) {
        this.customerCleared.emit();
      }
    });
  }

  protected onOptionSelected(event: MatAutocompleteSelectedEvent): void {
    this.customerSelected.emit(event.option.value as SellCustomer);
  }

  protected displayCustomer(customer: SellCustomer | string | null): string {
    return typeof customer === "string" ? customer : (customer?.name ?? "");
  }

  protected selectSingleMatch(): void {
    const matches = this.filteredCustomers();
    if (matches.length === 1 && typeof this.search.value === "string") {
      this.customerSelected.emit(matches[0]);
    }
  }
}
