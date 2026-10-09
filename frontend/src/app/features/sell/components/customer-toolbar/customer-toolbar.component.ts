import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import { Customer } from '../../models/sell.model';

@Component({
  selector: 'app-customer-toolbar',
  imports: [FormsModule, MatAutocompleteModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './customer-toolbar.component.html',
  styleUrl: './customer-toolbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerToolbarComponent {
  readonly customers = input<Customer[]>([]);
  readonly customerSelected = output<Customer>();
  readonly addCustomer = output<void>();
  readonly searchCustomers = output<string>();

  readonly filterText = signal('');

  readonly filteredCustomers = computed(() => {
    const term = this.filterText().trim().toLowerCase();
    if (!term) {
      return this.customers();
    }
    return this.customers().filter(
      (customer) => customer.name.toLowerCase().includes(term) || customer.phone.includes(term),
    );
  });

  onOptionSelected(event: MatAutocompleteSelectedEvent): void {
    const customer = event.option.value as Customer;
    this.filterText.set(customer.name);
    this.customerSelected.emit(customer);
  }

  displayCustomer(customer: Customer | string | null): string {
    return typeof customer === 'string' ? customer : (customer?.name ?? '');
  }

  search(): void {
    this.searchCustomers.emit(this.filterText());
  }
}
