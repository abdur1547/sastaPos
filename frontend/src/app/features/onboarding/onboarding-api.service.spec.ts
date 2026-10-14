import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";

import { environment } from "../../../environments/environment";
import { OnlineService } from "../../core/network/online.service";
import { ProductFormValue } from "../products/components/product-form/product-form.model";
import { OnboardingApiService } from "./onboarding-api.service";

describe("online onboarding API", () => {
  const online = signal(true);
  const network = {
    online,
    requireOnline: () => {
      if (!online()) throw new Error("offline");
    },
  };
  let api: OnboardingApiService;
  let http: HttpTestingController;
  const base = environment.apiBaseUrl;

  beforeEach(() => {
    online.set(true);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: OnlineService, useValue: network },
      ],
    });
    api = TestBed.inject(OnboardingApiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it("loads all customer pages directly and maps decimal and timestamp fields", async () => {
    const result = api.customers();
    http.expectOne(`${base}/api/customers?page=0&size=100`).flush({
      content: [
        {
          id: "c1",
          name: "Customer",
          accountBalance: 12.5,
          createdAt: "2026-10-14",
          lastUpdated: "2026-10-14",
        },
      ],
      totalPages: 2,
    });
    await Promise.resolve();
    http.expectOne(`${base}/api/customers?page=1&size=100`).flush({
      content: [
        {
          id: "c2",
          name: "Another",
          accountBalance: 0,
          createdAt: "2026-10-14",
        },
      ],
      totalPages: 2,
    });
    expect(await result).toEqual([
      expect.objectContaining({
        id: "c1",
        accountBalance: "12.5",
        dateCreated: "2026-10-14",
      }),
      expect.objectContaining({ id: "c2", accountBalance: "0" }),
    ]);
  });

  it("posts one product using exact backend field names, without client status or tax assignments", async () => {
    const value: ProductFormValue = {
      name: " Tea ",
      sku: " ",
      barcode: "012345",
      pctCode: "0902",
      description: "",
      unitPrice: "10.25",
      stockQuantity: "5",
      unitsOfMeasureId: "unit-1",
      taxCategoryIds: [],
      status: "ACTIVE",
    };
    const result = api.createProduct(value);
    const request = http.expectOne(`${base}/api/products`);
    expect(request.request.method).toBe("POST");
    expect(request.request.body).toEqual({
      name: "Tea",
      sku: null,
      barCode: "012345",
      pctCode: "0902",
      description: null,
      unitPrice: "10.25",
      stockQuantity: "5",
      unitOfMeasureId: "unit-1",
      taxCategoryIds: [],
    });
    request.flush({
      id: "p1",
      name: "Tea",
      barCode: "012345",
      unitOfMeasureId: "unit-1",
      unitPrice: 10.25,
      stockQuantity: 5,
      createdAt: "2026-10-14",
    });
    expect(await result).toEqual(
      expect.objectContaining({
        id: "p1",
        barcode: "012345",
        unitsOfMeasureId: "unit-1",
        unitPrice: "10.25",
        stockQuantity: "5",
        dateCreated: "2026-10-14",
      }),
    );
  });

  it("loads active units from the backend", async () => {
    const result = api.units();
    http
      .expectOne(`${base}/api/units-of-measure?page=0&size=100&isActive=true`)
      .flush({
        content: [{ id: "u1", name: "Each", code: "EA" }],
        totalPages: 1,
      });
    expect(await result).toEqual([{ id: "u1", name: "Each", code: "EA" }]);
  });

  it("does not make or queue requests offline", async () => {
    online.set(false);
    await expect(api.createCustomer({ name: "Customer" })).rejects.toThrow(
      "offline",
    );
    await expect(api.customers()).rejects.toThrow("offline");
    await expect(api.units()).rejects.toThrow("offline");
    http.expectNone(() => true);
  });

  it("surfaces backend validation failures", async () => {
    const result = api.createCustomer({ name: "Duplicate" });
    http
      .expectOne(`${base}/api/customers`)
      .flush(
        { message: "Customer already exists" },
        { status: 409, statusText: "Conflict" },
      );
    await expect(result).rejects.toThrow("Customer already exists");
  });
});
