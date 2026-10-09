import { TestBed } from "@angular/core/testing";
import { of } from "rxjs";

import { DatabaseService } from "../../core/database/database.service";
import { DEFAULT_PRODUCT_FILTERS } from "./product-query.model";
import { ProductRepository } from "./product.repository";

jest.mock("../../core/powersync/powersync.service", () => ({
  PowerSyncService: class PowerSyncService {},
}));

describe("ProductRepository.watchPage", () => {
  const watch = jest.fn();
  let repository: ProductRepository;

  beforeEach(() => {
    watch.mockReset().mockReturnValue(of([]));
    TestBed.configureTestingModule({
      providers: [{ provide: DatabaseService, useValue: { watch } }],
    });
    repository = TestBed.inject(ProductRepository);
  });

  it("only shows active products by default and binds every placeholder", () => {
    repository.watchPage("store", DEFAULT_PRODUCT_FILTERS, { pageIndex: 2, pageSize: 10 }).subscribe();

    const [sql, parameters] = watch.mock.calls[0];
    expect(sql).toContain("p.status = ?");
    expect(sql.match(/\?/g)).toHaveLength(parameters.length);
    expect(parameters.slice(-2)).toEqual([10, 20]);
  });

  it("combines search, stock, price and unit filters", () => {
    repository
      .watchPage(
        "store",
        {
          ...DEFAULT_PRODUCT_FILTERS,
          search: "50%",
          status: "ALL",
          stockOperator: "LTE",
          stockValue: "5",
          minPrice: "1",
          maxPrice: "abc",
          unitsOfMeasureId: "unit",
        },
        { pageIndex: 0, pageSize: 25 },
      )
      .subscribe();

    const [sql, parameters] = watch.mock.calls[0];
    expect(sql).not.toContain("p.status = ?");
    expect(sql).toContain("p.description LIKE");
    expect(sql).toContain("CAST(p.stock_quantity AS REAL) <= ?");
    expect(sql).not.toContain("CAST(p.unit_price AS REAL) <= ?");
    expect(sql.match(/\?/g)).toHaveLength(parameters.length);
    expect(parameters).toContain("%50\\%%");
  });
});
