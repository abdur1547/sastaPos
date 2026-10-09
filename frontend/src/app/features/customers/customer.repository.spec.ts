import { TestBed } from "@angular/core/testing";
import { of } from "rxjs";

import { DatabaseService } from "../../core/database/database.service";
import { DEFAULT_CUSTOMER_FILTERS } from "./customer-query.model";
import { CustomerRepository } from "./customer.repository";

jest.mock("../../core/powersync/powersync.service", () => ({
  PowerSyncService: class PowerSyncService {},
}));

describe("CustomerRepository.watchPage", () => {
  const watch = jest.fn();
  let repository: CustomerRepository;

  beforeEach(() => {
    watch.mockReset().mockReturnValue(of([]));
    TestBed.configureTestingModule({
      providers: [{ provide: DatabaseService, useValue: { watch } }],
    });
    repository = TestBed.inject(CustomerRepository);
  });

  it("only shows active customers by default and binds every placeholder", () => {
    repository.watchPage("store", DEFAULT_CUSTOMER_FILTERS, { pageIndex: 2, pageSize: 10 }).subscribe();

    const [sql, parameters] = watch.mock.calls[0];
    expect(sql).toContain("c.status = ?");
    expect(sql.match(/\?/g)).toHaveLength(parameters.length);
    expect(parameters.slice(-2)).toEqual([10, 20]);
  });

  it("combines search and balance filters", () => {
    repository
      .watchPage(
        "store",
        { ...DEFAULT_CUSTOMER_FILTERS, search: "50%", status: "ALL", balance: "OWES" },
        { pageIndex: 0, pageSize: 25 },
      )
      .subscribe();

    const [sql, parameters] = watch.mock.calls[0];
    expect(sql).not.toContain("c.status = ?");
    expect(sql).toContain("c.phone_number LIKE");
    expect(sql).toContain("CAST(c.account_balance AS REAL) > 0");
    expect(sql.match(/\?/g)).toHaveLength(parameters.length);
    expect(parameters).toContain("%50\\%%");
  });
});
