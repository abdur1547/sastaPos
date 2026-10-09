import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import { Product } from '../../models/sell.model';

@Component({
  selector: 'app-product-toolbar',
  imports: [FormsModule, MatAutocompleteModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './product-toolbar.component.html',
  styleUrl: './product-toolbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductToolbarComponent implements AfterViewInit {
  readonly products = input<Product[]>([]);
  readonly productSelected = output<Product>();
  readonly addProduct = output<void>();
  readonly createReturn = output<void>();
  readonly searchProducts = output<string>();

  private readonly productInput = viewChild<ElementRef<HTMLInputElement>>('productInput');

  readonly filterText = signal('');

  readonly filteredProducts = computed(() => {
    const term = this.filterText().trim().toLowerCase();
    if (!term) {
      return this.products();
    }
    return this.products().filter((product) => product.name.toLowerCase().includes(term));
  });

  ngAfterViewInit(): void {
    this.focusSearch();
  }

  focusSearch(): void {
    this.productInput()?.nativeElement.focus();
  }

  onOptionSelected(event: MatAutocompleteSelectedEvent): void {
    const product = event.option.value as Product;
    this.productSelected.emit(product);
    this.filterText.set('');
    queueMicrotask(() => this.focusSearch());
  }

  // Products are added to the table on select, so the field should stay empty for the next search.
  displayProduct(): string {
    return '';
  }

  search(): void {
    this.searchProducts.emit(this.filterText());
  }
}
