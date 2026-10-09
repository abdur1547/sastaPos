import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { DatePipe } from "@angular/common";
import { MatProgressBarModule } from "@angular/material/progress-bar";

import { ProductListItem } from "../../product-query.model";

export const LOW_STOCK_LIMIT = 5;

@Component({
  selector: "app-product-table",
  imports: [DatePipe, MatProgressBarModule],
  templateUrl: "./product-table.component.html",
  styleUrl: "./product-table.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductTableComponent {
  readonly products = input<readonly ProductListItem[]>([]);
  readonly loading = input(false);
  readonly selectProduct = output<ProductListItem>();

  protected stockLevel(product: ProductListItem): "out" | "low" | "ok" {
    const quantity = Number(product.stockQuantity);
    if (quantity <= 0) {
      return "out";
    }
    return quantity <= LOW_STOCK_LIMIT ? "low" : "ok";
  }
}
