import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
} from "@angular/core";
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSelectModule } from "@angular/material/select";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";

import { FormAlertComponent } from "../../../../shared/components/form-alert/form-alert.component";
import { Product } from "../../product.model";
import {
  TaxCategoryOption,
  UnitOfMeasureOption,
} from "../../product-lookup.model";
import { ProductFormValue } from "./product-form.model";

const MAX_TEXT = 255;
const DECIMAL_PATTERN = /^\d{1,16}(\.\d{1,2})?$/;

/** One form for both creating and editing a product; pass `product` to edit. */
@Component({
  selector: "app-product-form",
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSlideToggleModule,
    FormAlertComponent,
  ],
  templateUrl: "./product-form.component.html",
  styleUrl: "./product-form.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductFormComponent {
  readonly product = input<Product | null>(null);
  readonly unitsOfMeasure = input<readonly UnitOfMeasureOption[]>([]);
  readonly taxCategories = input<readonly TaxCategoryOption[]>([]);
  readonly saving = input(false);
  readonly errorMessage = input("");

  readonly submitted = output<ProductFormValue>();
  readonly cancelled = output<void>();

  protected readonly isEdit = computed(() => this.product() !== null);

  private readonly formBuilder = inject(FormBuilder).nonNullable;
  protected readonly form = this.formBuilder.group({
    name: ["", [Validators.required, Validators.maxLength(MAX_TEXT)]],
    sku: ["", Validators.maxLength(MAX_TEXT)],
    barcode: ["", Validators.maxLength(MAX_TEXT)],
    pctCode: ["", [Validators.required, Validators.maxLength(MAX_TEXT)]],
    description: ["", Validators.maxLength(5000)],
    unitPrice: ["", [Validators.required, Validators.pattern(DECIMAL_PATTERN)]],
    stockQuantity: [
      "0",
      [Validators.required, Validators.pattern(DECIMAL_PATTERN)],
    ],
    unitsOfMeasureId: ["", Validators.required],
    taxCategoryIds: [[] as string[]],
    status: [true],
  });

  constructor() {
    effect(() => {
      const product = this.product();
      if (!product) {
        return;
      }
      this.form.reset({
        name: product.name,
        sku: product.sku ?? "",
        barcode: product.barcode ?? "",
        pctCode: product.pctCode,
        description: product.description ?? "",
        unitPrice: product.unitPrice,
        stockQuantity: product.stockQuantity,
        unitsOfMeasureId: product.unitsOfMeasureId,
        taxCategoryIds: [...product.taxCategoryIds],
        status: product.status === "ACTIVE",
      });
      // Stock is changed through stock movements, never through the product form.
      this.form.controls.stockQuantity.disable();
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.submitted.emit({
      ...value,
      taxCategoryIds: value.taxCategoryIds,
      status: value.status ? "ACTIVE" : "INACTIVE",
    });
  }

  protected fieldError(control: AbstractControl): string {
    const errors = control.errors;
    if (!errors) {
      return "";
    }
    if (errors["required"]) {
      return "This field is required.";
    }
    if (errors["maxlength"]) {
      return `Must be at most ${errors["maxlength"].requiredLength} characters.`;
    }
    if (errors["pattern"]) {
      return "Enter a non-negative amount with up to 2 decimals.";
    }
    return "This value is invalid.";
  }
}
