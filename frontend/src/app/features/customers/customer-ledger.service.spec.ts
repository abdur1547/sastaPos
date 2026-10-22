import { TestBed } from "@angular/core/testing";
import { of } from "rxjs";

import { AuthService } from "../../core/auth/auth.service";
import { CustomerValidationError } from "./customer.errors";
import { CustomerRepository } from "./customer.repository";
import { CustomerService } from "./customer.service";
import {
  DEFAULT_LEDGER_FILTERS,
  DEFAULT_LEDGER_SORT,
  EMPTY_LEDGER_PAGE,
} from "./customer-ledger.model";
import { CustomerLedgerRepository } from "./customer-ledger.repository";
import { CustomerPaymentRepository } from "./customer-payment.repository";

jest.mock("../../core/powersync/powersync.service", () => ({
  PowerSyncService: class PowerSyncService {},
}));

describe("CustomerService.watchLedger", () => {
  const customerId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
  const storeId = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
  const watchPage = jest.fn();
  const user = jest.fn();
  let service: CustomerService;

  beforeEach(() => {
    user.mockReset().mockReturnValue({ id: "user", storeId });
    watchPage.mockReset().mockReturnValue(of(EMPTY_LEDGER_PAGE));
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user } },
        { provide: CustomerRepository, useValue: {} },
        { provide: CustomerPaymentRepository, useValue: {} },
        { provide: CustomerLedgerRepository, useValue: { watchPage } },
      ],
    });
    service = TestBed.inject(CustomerService);
  });

  it("reads the ledger locally for the signed-in store, resolving the period", () => {
    service.watchLedger(
      customerId,
      { ...DEFAULT_LEDGER_FILTERS, datePreset: "custom", customFrom: "2026-03-01", customTo: "2026-03-31" },
      DEFAULT_LEDGER_SORT,
      { pageIndex: 1, pageSize: 10 },
    );

    const [query, sort, request] = watchPage.mock.calls[0];
    expect(query.customerId).toBe(customerId);
    expect(query.storeId).toBe(storeId);
    expect(query.range.from).toEqual(expect.stringMatching(/^2026-0[23]-\d{2} \d{2}:00:00$/));
    expect(query.range.to).toEqual(expect.stringMatching(/^2026-0[34]-\d{2} \d{2}:00:00$/));
    expect(sort).toBe(DEFAULT_LEDGER_SORT);
    expect(request).toEqual({ pageIndex: 1, pageSize: 10 });
  });

  it("leaves the period unbounded for all time", () => {
    service.watchLedger(customerId, DEFAULT_LEDGER_FILTERS, DEFAULT_LEDGER_SORT, {
      pageIndex: 0,
      pageSize: 25,
    });
    expect(watchPage.mock.calls[0][0].range).toEqual({ from: null, to: null });
  });

  it("rejects invalid customer ids and missing stores", () => {
    expect(() =>
      service.watchLedger("nope", DEFAULT_LEDGER_FILTERS, DEFAULT_LEDGER_SORT, {
        pageIndex: 0,
        pageSize: 25,
      }),
    ).toThrow(CustomerValidationError);
    user.mockReturnValue(null);
    expect(() =>
      service.watchLedger(customerId, DEFAULT_LEDGER_FILTERS, DEFAULT_LEDGER_SORT, {
        pageIndex: 0,
        pageSize: 25,
      }),
    ).toThrow(CustomerValidationError);
    expect(watchPage).not.toHaveBeenCalled();
  });
});
