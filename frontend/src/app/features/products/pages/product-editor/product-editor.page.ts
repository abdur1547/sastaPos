import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { MatIconModule } from "@angular/material/icon";
import { MatSnackBar } from "@angular/material/snack-bar";
import { catchError, from, map, of, startWith, switchMap } from "rxjs";

import { ProductFormValue } from "../../components/product-form/product-form.model";
import { ProductFormComponent } from "../../components/product-form/product-form.component";
import { Product } from "../../product.model";
import { ProductLookupService } from "../../product-lookup.service";
import { ProductService } from "../../product.service";

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly product: Product | null }
  | { readonly status: "missing" }
  | { readonly status: "error"; readonly message: string };

/** Hosts the shared product form for both `/products/new` and `/products/:id`. */
@Component({
  selector: "app-product-editor-page",
  imports: [MatIconModule, RouterLink, ProductFormComponent],
  templateUrl: "./product-editor.page.html",
  styleUrl: "./product-editor.page.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductEditorPage {
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly products = inject(ProductService);
  private readonly lookup = inject(ProductLookupService);

  protected readonly unitsOfMeasure = toSignal(this.lookup.watchUnitsOfMeasure(), { initialValue: [] });
  protected readonly taxCategories = toSignal(this.lookup.watchTaxCategories(), { initialValue: [] });

  protected readonly saving = signal(false);
  protected readonly saveError = signal("");

  protected readonly state = toSignal(
    inject(ActivatedRoute).paramMap.pipe(
      map((params) => params.get("id")),
      switchMap((id): ReturnType<typeof this.load> => this.load(id)),
    ),
    { initialValue: { status: "loading" } as LoadState },
  );

  protected readonly product = computed(() => {
    const state = this.state();
    return state.status === "ready" ? state.product : null;
  });
  protected readonly title = computed(() => (this.product() ? this.product()!.name : "New product"));

  protected async save(value: ProductFormValue): Promise<void> {
    this.saving.set(true);
    this.saveError.set("");
    try {
      const product = this.product();
      if (product) {
        await this.products.update(product.id, {
          name: value.name,
          sku: emptyToNull(value.sku),
          barcode: emptyToNull(value.barcode),
          pctCode: value.pctCode,
          description: emptyToNull(value.description),
          unitPrice: value.unitPrice,
          unitsOfMeasureId: value.unitsOfMeasureId,
          taxCategoryIds: value.taxCategoryIds,
          status: value.status,
        });
      } else {
        await this.products.create({
          name: value.name,
          sku: emptyToNull(value.sku),
          barcode: emptyToNull(value.barcode),
          pctCode: value.pctCode,
          description: emptyToNull(value.description),
          unitPrice: value.unitPrice,
          stockQuantity: value.stockQuantity,
          unitsOfMeasureId: value.unitsOfMeasureId,
          taxCategoryIds: value.taxCategoryIds,
        });
      }
      this.snackBar.open(product ? "Product updated" : "Product created", "Dismiss", { duration: 3000 });
      await this.goBack();
    } catch (error) {
      this.saveError.set(error instanceof Error ? error.message : "Could not save the product.");
    } finally {
      this.saving.set(false);
    }
  }

  protected goBack(): Promise<boolean> {
    return this.router.navigate(["/products"]);
  }

  private load(id: string | null) {
    if (!id || id === "new") {
      return of<LoadState>({ status: "ready", product: null });
    }
    return from(this.products.findById(id)).pipe(
      map((product): LoadState => (product ? { status: "ready", product } : { status: "missing" })),
      catchError((error: unknown) =>
        of<LoadState>({
          status: "error",
          message: error instanceof Error ? error.message : "Could not load the product.",
        }),
      ),
      startWith<LoadState>({ status: "loading" }),
    );
  }
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
