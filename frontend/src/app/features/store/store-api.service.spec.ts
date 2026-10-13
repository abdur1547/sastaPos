import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";

import { environment } from "../../../environments/environment";
import { ApiError } from "../../core/http/api-error.model";
import { StoreApiService } from "./store-api.service";

describe("StoreApiService", () => {
  let api: StoreApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(StoreApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("loads the authenticated store directly from the backend", () => {
    const response = { id: "store", name: "Counter" };
    const next = jest.fn();
    api.getStore().subscribe(next);
    const request = http.expectOne(`${environment.apiBaseUrl}/api/store`);
    expect(request.request.method).toBe("GET");
    request.flush(response);
    expect(next).toHaveBeenCalledWith(response);
  });

  it("patches store details with the exact supplied fields", () => {
    api.updateStore({ name: "Updated", address: "" }).subscribe();
    const request = http.expectOne(`${environment.apiBaseUrl}/api/store`);
    expect(request.request.method).toBe("PATCH");
    expect(request.request.body).toEqual({ name: "Updated", address: "" });
    request.flush({ name: "Updated" });
  });

  it("patches settings without sending a next invoice number", () => {
    const next = jest.fn();
    api
      .updateSettings({ invoiceNumberStart: 0, receiptFooter: "" })
      .subscribe(next);
    const request = http.expectOne(
      `${environment.apiBaseUrl}/api/store/settings`,
    );
    expect(request.request.method).toBe("PATCH");
    expect(request.request.body).toEqual({
      invoiceNumberStart: 0,
      receiptFooter: "",
    });
    request.flush({ nextInvoiceNumber: 101 });
    expect(next).toHaveBeenCalledWith({ nextInvoiceNumber: 101 });
  });

  it("surfaces network failures rather than treating them as queued saves", () => {
    const failure = jest.fn();
    api.updateSettings({ invoicePrefix: "INV" }).subscribe({ error: failure });
    http
      .expectOne(`${environment.apiBaseUrl}/api/store/settings`)
      .error(new ProgressEvent("error"));
    expect(failure).toHaveBeenCalledWith(expect.any(ApiError));
    expect(failure.mock.calls[0][0].kind).toBe("network");
  });

  it("preserves backend validation errors for the page", () => {
    const failure = jest.fn();
    api.updateStore({ timezone: "invalid" }).subscribe({ error: failure });
    http
      .expectOne(`${environment.apiBaseUrl}/api/store`)
      .flush(
        {
          message: "Invalid timezone",
          fieldErrors: [
            { property: "timezone", message: "Use an IANA timezone." },
          ],
        },
        { status: 400, statusText: "Bad Request" },
      );
    expect(failure.mock.calls[0][0].fieldErrors).toEqual([
      { property: "timezone", message: "Use an IANA timezone." },
    ]);
  });
});
