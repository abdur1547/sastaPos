import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  output,
  viewChild,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
  MatAutocompleteTrigger,
} from "@angular/material/autocomplete";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { map, startWith } from "rxjs";

import { SellProduct } from "../../models/sell.model";

@Component({
  selector: "app-product-toolbar",
  imports: [
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: "./product-toolbar.component.html",
  styleUrl: "./product-toolbar.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductToolbarComponent implements AfterViewInit {
  readonly products = input<readonly SellProduct[]>([]);
  readonly productSelected = output<SellProduct>();
  readonly addProduct = output<void>();
  readonly createReturn = output<void>();

  private readonly productInput =
    viewChild<ElementRef<HTMLInputElement>>("productInput");
  private readonly trigger = viewChild(MatAutocompleteTrigger);

  protected readonly search = new FormControl("", { nonNullable: true });

  private readonly searchText = toSignal(
    // Material writes the picked option object into the control before `select` clears it.
    this.search.valueChanges.pipe(
      startWith(""),
      map((value) => (typeof value === "string" ? value : "")),
    ),
    { initialValue: "" },
  );

  protected readonly filteredProducts = computed(() => {
    const term = this.searchText().trim().toLowerCase();
    if (!term) {
      return this.products();
    }
    return this.products().filter((product) =>
      [product.name, product.sku, product.barcode].some((field) =>
        field?.toLowerCase().includes(term),
      ),
    );
  });

  ngAfterViewInit(): void {
    this.focusSearch();
  }

  focusSearch(): void {
    this.productInput()?.nativeElement.focus();
  }

  protected onOptionSelected(event: MatAutocompleteSelectedEvent): void {
    this.select(event.option.value as SellProduct);
  }

  // Products are added to the table on select, so the field should stay empty for the next search.
  protected displayProduct(): string {
    return "";
  }

  /** Scanner/Enter flow: an exact barcode or SKU match, or the only remaining match, is added directly. */
  protected submitSearch(): void {
    if (this.trigger()?.activeOption) {
      return;
    }
    const term = this.searchText().trim().toLowerCase();
    if (!term) {
      return;
    }
    const matches = this.filteredProducts();
    const exact = matches.find(
      (product) =>
        product.barcode?.toLowerCase() === term ||
        product.sku?.toLowerCase() === term,
    );
    const target = exact ?? (matches.length === 1 ? matches[0] : null);
    if (target) {
      this.trigger()?.closePanel();
      this.select(target);
    }
  }

  private select(product: SellProduct): void {
    this.productSelected.emit(product);
    this.search.setValue("");
    queueMicrotask(() => this.focusSearch());
  }
}
