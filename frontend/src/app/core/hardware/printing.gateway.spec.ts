import { TestBed } from "@angular/core/testing";
import { invoke, isTauri } from "@tauri-apps/api/core";

import { environment } from "../../../environments/environment";
import { AuthService } from "../auth/auth.service";
import { PrintingGateway, TerminalReceiptSettings } from "./printing.gateway";

jest.mock("@tauri-apps/api/core", () => ({
  invoke: jest.fn(),
  isTauri: jest.fn(),
}));
jest.mock("../auth/auth.service", () => ({
  AuthService: class AuthService {},
}));

describe("PrintingGateway", () => {
  let gateway: PrintingGateway;
  const user = jest.fn();
  const originalProduction = environment.production;
  const settings: TerminalReceiptSettings = {
    config: {
      version: 1,
      paperProfile: "58mm",
      header: "",
      footer: "",
      showSku: false,
      showBarcode: false,
      showCustomer: true,
    },
    autoPrint: true,
    copyCount: 1,
    printer: "none",
    virtualOutcome: "success",
  };

  beforeEach(() => {
    jest.resetAllMocks();
    environment.production = false;
    jest.mocked(isTauri).mockReturnValue(true);
    user.mockReturnValue({ storeId: "store-a" });
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { user } }],
    });
    gateway = TestBed.inject(PrintingGateway);
  });

  afterEach(() => {
    environment.production = originalProduction;
  });

  it("passes settings to Rust without browser persistence", async () => {
    jest.mocked(invoke).mockResolvedValue(settings);
    expect(await gateway.settings()).toBe(settings);
    await gateway.saveSettings(settings);
    expect(invoke).toHaveBeenCalledWith("receipt_settings_get");
    expect(invoke).toHaveBeenCalledWith("receipt_settings_save", { settings });
  });

  it("scopes history retry and reprint to the signed-in store", async () => {
    await gateway.history();
    await gateway.retry("job", true);
    await gateway.reprint("sale");
    expect(invoke).toHaveBeenCalledWith("receipt_history", {
      storeId: "store-a",
    });
    expect(invoke).toHaveBeenCalledWith("receipt_retry", {
      storeId: "store-a",
      jobId: "job",
      confirmed: true,
    });
    expect(invoke).toHaveBeenCalledWith("receipt_reprint", {
      storeId: "store-a",
      saleId: "sale",
    });
  });

  it("does not confirm uncertain delivery implicitly", async () => {
    await gateway.retry("job");
    expect(invoke).toHaveBeenCalledWith("receipt_retry", {
      storeId: "store-a",
      jobId: "job",
      confirmed: false,
    });
  });

  it("rejects browser use without a fallback", async () => {
    jest.mocked(isTauri).mockReturnValue(false);
    await expect(gateway.settings()).rejects.toThrow("desktop app");
    await expect(gateway.history()).rejects.toThrow("desktop app");
    await expect(gateway.saveSettings(settings)).rejects.toThrow("desktop app");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("rejects missing store identifiers and invalid copy counts", async () => {
    user.mockReturnValue(null);
    await expect(gateway.history()).rejects.toThrow("Sign in");
    for (const copyCount of [0, 6, 1.5]) {
      await expect(
        gateway.saveSettings({ ...settings, copyCount }),
      ).rejects.toThrow("copy count");
    }
    await expect(gateway.retry("")).rejects.toThrow("print job");
    await expect(gateway.reprint("")).rejects.toThrow("saved sale");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("production permits no-printer settings but prohibits virtual devices", async () => {
    environment.production = true;
    await gateway.saveSettings(settings);
    await expect(
      gateway.saveSettings({ ...settings, printer: "virtual" }),
    ).rejects.toThrow("development printer");
    await expect(
      gateway.saveSettings({ ...settings, virtualOutcome: "uncertain" }),
    ).rejects.toThrow("development printer");
  });

  it("surfaces native retry and persistence failures", async () => {
    jest.mocked(invoke).mockRejectedValue("Confirm uncertain delivery");
    await expect(gateway.retry("job")).rejects.toBe(
      "Confirm uncertain delivery",
    );
  });
});
