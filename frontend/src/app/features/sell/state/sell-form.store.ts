import { Injectable, computed, signal } from "@angular/core";
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from "@angular/forms";

import { fromScaled, toScaled } from "../domain/decimal";
import { previewTotals } from "../domain/sale-calculator";
import { SellCustomer, SellProduct } from "../models/sell.model";
import { CheckoutInput, CheckoutPayment } from "../sale.service";

export type SellLineGroup = FormGroup<{
  product: FormControl<SellProduct>;
  quantity: FormControl<number | null>;
}>;

export type SellFormGroup = FormGroup<{
  customer: FormControl<SellCustomer | null>;
  discount: FormControl<number | null>;
  lines: FormArray<SellLineGroup>;
}>;

const MIN_QUANTITY = 0.01;

function quantityValidator(product: SellProduct): ValidatorFn {
  return (control: AbstractControl<number | null>): ValidationErrors | null => {
    const value = control.value;
    if (value === null || !Number.isFinite(value)) {
      return { required: true };
    }
    if (value <= 0) {
      return { min: true };
    }
    if (!product.allowsFraction && !Number.isInteger(value)) {
      return { wholeNumber: true };
    }
    return null;
  };
}

function createLine(product: SellProduct, quantity: number): SellLineGroup {
  return new FormGroup({
    product: new FormControl(product, { nonNullable: true }),
    quantity: new FormControl<number | null>(quantity, [
      quantityValidator(product),
    ]),
  });
}

/**
 * Screen-level state of the sell page. It is a root service so a half-filled sale survives
 * navigating to the customer/product editors and back.
 */
@Injectable({ providedIn: "root" })
export class SellFormStore {
  readonly form: SellFormGroup = new FormGroup({
    customer: new FormControl<SellCustomer | null>(null),
    discount: new FormControl<number | null>(0, [Validators.min(0)]),
    lines: new FormArray<SellLineGroup>([]),
  });

  /** The pending bill being edited, if the cart was resumed from one. */
  readonly activeDraftId = signal<string | null>(null);

  private readonly revision = signal(0);

  readonly customer = computed(() => {
    this.revision();
    return this.form.controls.customer.value;
  });

  readonly items = computed(() => {
    this.revision();
    return this.form.controls.lines.controls.map((group) => ({
      product: group.controls.product.value,
      quantity: this.sanitize(group.controls.quantity.value),
    }));
  });

  readonly totals = computed(() => {
    this.revision();
    return previewTotals(
      this.items(),
      this.sanitize(this.form.controls.discount.value),
    );
  });

  readonly totalQuantity = computed(() =>
    fromScaled(
      this.items().reduce((sum, item) => sum + toScaled(item.quantity, 2), 0n),
      2,
    )
      .replace(/\.00$/, "")
      .replace(/(\.\d)0$/, "$1"),
  );

  readonly valid = computed(() => {
    this.revision();
    return this.form.valid;
  });

  readonly discountTooHigh = computed(() => {
    this.revision();
    return this.form.hasError("discountTooHigh");
  });

  readonly isEmpty = computed(() => this.items().length === 0);

  constructor() {
    this.form.addValidators(this.discountWithinSubtotal);
    this.form.valueChanges.subscribe(() =>
      this.revision.update((value) => value + 1),
    );
  }

  get lines(): FormArray<SellLineGroup> {
    return this.form.controls.lines;
  }

  setCustomer(customer: SellCustomer | null): void {
    this.form.controls.customer.setValue(customer);
  }

  addProduct(product: SellProduct, quantity = 1): void {
    const existing = this.lines.controls.find(
      (group) => group.controls.product.value.id === product.id,
    );
    if (existing) {
      existing.controls.quantity.setValue(
        this.sanitize(existing.controls.quantity.value) + quantity,
      );
      return;
    }
    this.lines.push(createLine(product, quantity));
  }

  removeProduct(productId: string): void {
    const index = this.lines.controls.findIndex(
      (group) => group.controls.product.value.id === productId,
    );
    if (index >= 0) {
      this.lines.removeAt(index);
    }
  }

  /** Replaces the whole cart, e.g. when resuming a pending bill. */
  restore(input: {
    draftId: string | null;
    customer: SellCustomer | null;
    discount: number;
    items: readonly { product: SellProduct; quantity: number }[];
  }): void {
    this.lines.clear({ emitEvent: false });
    for (const item of input.items) {
      this.lines.push(createLine(item.product, item.quantity), {
        emitEvent: false,
      });
    }
    this.form.patchValue({
      customer: input.customer,
      discount: input.discount,
    });
    this.activeDraftId.set(input.draftId);
  }

  reset(): void {
    this.restore({ draftId: null, customer: null, discount: 0, items: [] });
    this.form.markAsPristine();
  }

  checkoutInput(payment?: CheckoutPayment): CheckoutInput {
    return {
      saleId: this.activeDraftId(),
      customerId: this.customer()?.id ?? null,
      discount: this.sanitize(this.form.controls.discount.value),
      lines: this.items(),
      payment: payment ?? null,
    };
  }

  private sanitize(value: number | null): number {
    return value !== null && Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  private readonly discountWithinSubtotal: ValidatorFn =
    (): ValidationErrors | null => {
      const discount = toScaled(
        this.sanitize(this.form.controls.discount.value),
        2,
      );
      const subtotal = toScaled(
        previewTotals(
          this.form.controls.lines.controls.map((group) => ({
            product: group.controls.product.value,
            quantity: this.sanitize(group.controls.quantity.value),
          })),
          0,
        ).subtotal,
        2,
      );
      return discount > subtotal ? { discountTooHigh: true } : null;
    };
}
