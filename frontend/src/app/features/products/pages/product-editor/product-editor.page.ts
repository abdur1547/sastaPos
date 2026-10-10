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
import {
  RETURN_TO_PARAM,
  safeReturnUrl,
} from "../../../../core/navigation/return-navigation";
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

  protected readonly unitsOfMeasure = toSignal(
    this.lookup.watchUnitsOfMeasure(),
    { initialValue: [] },
  );
  protected readonly taxCategories = toSignal(
    this.lookup.watchTaxCategories(),
    { initialValue: [] },
  );

  private readonly route = inject(ActivatedRoute);

  /** Set when another screen (e.g. Sell) sent the user here and expects them back. */
  private readonly returnTo = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => safeReturnUrl(params.get(RETURN_TO_PARAM))),
    ),
    { initialValue: null },
  );
  protected readonly backUrl = computed(() => this.returnTo() ?? "/products");
  protected readonly backLabel = computed(() =>
    this.returnTo() ? "Back" : "Products",
  );

  protected readonly saving = signal(false);
  protected readonly saveError = signal("");

  protected readonly state = toSignal(
    this.route.paramMap.pipe(
      map((params) => params.get("id")),
      switchMap((id): ReturnType<typeof this.load> => this.load(id)),
    ),
    { initialValue: { status: "loading" } as LoadState },
  );

  protected readonly product = computed(() => {
    const state = this.state();
    return state.status === "ready" ? state.product : null;
  });
  protected readonly title = computed(() =>
    this.product() ? this.product()!.name : "New product",
  );

  protected async save(value: ProductFormValue): Promise<void> {
    this.saving.set(true);
    this.saveError.set("");
    try {
      const product = this.product();
      let created: { id: string } | null = null;
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
        created = await this.products.create({
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
      this.snackBar.open(
        product ? "Product updated" : "Product created",
        "Dismiss",
        { duration: 3000 },
      );
      await this.goBack(created?.id);
    } catch (error) {
      this.saveError.set(
        error instanceof Error ? error.message : "Could not save the product.",
      );
    } finally {
      this.saving.set(false);
    }
  }

  protected goBack(createdId?: string): Promise<boolean> {
    const returnTo = this.returnTo();
    if (returnTo) {
      return this.router.navigateByUrl(withCreatedId(returnTo, createdId));
    }
    return this.router.navigate(["/products"]);
  }

  private load(id: string | null) {
    if (!id || id === "new") {
      return of<LoadState>({ status: "ready", product: null });
    }
    return from(this.products.findById(id)).pipe(
      map((product): LoadState =>
        product ? { status: "ready", product } : { status: "missing" },
      ),
      catchError((error: unknown) =>
        of<LoadState>({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Could not load the product.",
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

/** Hands the new entity back to the originating screen, which selects it. */
function withCreatedId(url: string, createdId: string | undefined): string {
  if (!createdId) {
    return url;
  }
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}newProductId=${encodeURIComponent(createdId)}`;
}
