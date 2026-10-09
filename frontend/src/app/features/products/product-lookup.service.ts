import { Injectable, inject } from "@angular/core";
import { Observable, map } from "rxjs";

import { DatabaseService } from "../../core/database/database.service";
import {
  TaxCategoryOption,
  UnitOfMeasureOption,
} from "./product-lookup.model";

/** Reference data a product points to, read from the locally synced tables. */
@Injectable({ providedIn: "root" })
export class ProductLookupService {
  private readonly database = inject(DatabaseService);

  watchUnitsOfMeasure(): Observable<readonly UnitOfMeasureOption[]> {
    return this.database
      .watch(
        "SELECT id, name, code FROM units_of_measures WHERE is_active = 1 ORDER BY name COLLATE NOCASE",
      )
      .pipe(
        map((rows) =>
          rows.map((row) => ({
            id: String(row["id"]),
            name: String(row["name"]),
            code: String(row["code"]),
          })),
        ),
      );
  }

  watchTaxCategories(): Observable<readonly TaxCategoryOption[]> {
    return this.database
      .watch(
        "SELECT id, name, code, rate FROM tax_categories WHERE is_active = 1 ORDER BY name COLLATE NOCASE",
      )
      .pipe(
        map((rows) =>
          rows.map((row) => ({
            id: String(row["id"]),
            name: String(row["name"]),
            code: String(row["code"]),
            rate: Number(row["rate"]),
          })),
        ),
      );
  }
}
