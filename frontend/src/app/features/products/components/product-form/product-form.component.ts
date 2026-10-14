import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ErrorHandler,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import {
  AbstractControl,
  FormBuilder,
  FormGroupDirective,
  FormControl,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSelectModule } from "@angular/material/select";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";

import { environment } from "../../../../../environments/environment";
import {
  ScanConsumer,
  ScanConsumerService,
} from "../../../../core/hardware/scan-consumer.service";
import {
  ScannerGateway,
  ScannerSimulation,
} from "../../../../core/hardware/scanner.gateway";
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
export class ProductFormComponent implements OnInit, OnDestroy {
  readonly product = input<Product | null>(null);
  readonly unitsOfMeasure = input<readonly UnitOfMeasureOption[]>([]);
  readonly taxCategories = input<readonly TaxCategoryOption[]>([]);
  readonly showTaxes = input(true);
  readonly saving = input(false);
  readonly errorMessage = input("");

  readonly submitted = output<ProductFormValue>();
  private readonly formDirective = viewChild(FormGroupDirective);
  readonly cancelled = output<void>();

  protected readonly isEdit = computed(() => this.product() !== null);
  protected readonly development = !environment.production;
  protected readonly simulatedBarcode = new FormControl("036000291452", {
    nonNullable: true,
  });
  protected readonly scannerReady = signal(false);
  protected readonly scannerBusy = signal(false);
  protected readonly scannerError = signal("");

  private readonly scanner = inject(ScannerGateway);
  private readonly consumers = inject(ScanConsumerService);
  private readonly errorHandler = inject(ErrorHandler);
  private readonly barcodeInput =
    viewChild<ElementRef<HTMLInputElement>>("barcodeInput");
  private readonly barcodeFocused = signal(false);
  private simulation: ScannerSimulation | null = null;
  private consumer: ScanConsumer | null = null;
  private destroyed = false;

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
      if (this.barcodeFocused() && !this.saving()) {
        this.activateBarcodeConsumer();
      } else {
        this.releaseBarcodeConsumer();
      }
    });
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

  async ngOnInit(): Promise<void> {
    if (!this.development) {
      return;
    }
    try {
      const simulation = await this.scanner.openSimulator((event) => {
        if (
          !this.destroyed &&
          !this.saving() &&
          this.barcodeFocused() &&
          this.form.controls.barcode.enabled
        ) {
          this.consumer?.receive(event);
        }
      });
      if (this.destroyed) {
        await simulation.close();
        return;
      }
      this.simulation = simulation;
      this.scannerReady.set(true);
    } catch (error) {
      this.reportScannerError(error);
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.releaseBarcodeConsumer();
    if (this.simulation) {
      void this.simulation
        .close()
        .catch((error: unknown) => this.errorHandler.handleError(error));
      this.simulation = null;
    }
  }

  protected focusBarcode(): void {
    this.barcodeFocused.set(true);
    this.activateBarcodeConsumer();
  }

  protected blurBarcode(): void {
    this.barcodeFocused.set(false);
    this.releaseBarcodeConsumer();
  }

  protected async simulateScan(): Promise<void> {
    if (
      !this.simulation ||
      !this.scannerReady() ||
      this.scannerBusy() ||
      this.saving() ||
      this.form.controls.barcode.disabled
    ) {
      return;
    }
    this.barcodeInput()?.nativeElement.focus();
    this.scannerBusy.set(true);
    this.scannerError.set("");
    try {
      await this.simulation.sendChunk(`${this.simulatedBarcode.value}\r`);
    } catch (error) {
      this.reportScannerError(error);
    } finally {
      this.scannerBusy.set(false);
    }
  }

  private activateBarcodeConsumer(): void {
    if (
      this.consumer ||
      this.destroyed ||
      this.saving() ||
      this.form.controls.barcode.disabled
    ) {
      return;
    }
    this.consumer = this.consumers.activate(
      (barcode) => {
        this.form.controls.barcode.setValue(barcode);
        this.form.controls.barcode.markAsDirty();
        this.scannerError.set("");
      },
      (message) => this.scannerError.set(message),
    );
  }

  private releaseBarcodeConsumer(): void {
    this.consumer?.release();
    this.consumer = null;
  }

  private reportScannerError(error: unknown): void {
    if (this.destroyed) {
      this.errorHandler.handleError(error);
      return;
    }
    this.scannerError.set(
      error instanceof Error ? error.message : String(error),
    );
  }

  protected submit(): void {
    if (this.saving()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.blurBarcode();
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

  reset(): void {
    // resetForm() also clears the directive's submitted flag so errors don't reappear.
    const directive = this.formDirective();
    if (directive) {
      directive.resetForm();
    } else {
      this.form.reset();
    }
  }

  hasDraft(): boolean {
    return this.form.dirty;
  }
}
