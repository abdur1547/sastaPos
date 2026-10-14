import { ErrorHandler } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MatDialog } from "@angular/material/dialog";
import { of } from "rxjs";

import { environment } from "../../../environments/environment";
import {
  PrintJob,
  PrintingGateway,
  ReceiptHistory,
  TerminalReceiptSettings,
} from "../../core/hardware/printing.gateway";
import { ReceiptJobsPage } from "./receipt-jobs.page";

describe("ReceiptJobsPage", () => {
  let fixture: ComponentFixture<ReceiptJobsPage>;
  const settings = jest.fn();
  const history = jest.fn();
  const saveSettings = jest.fn();
  const retry = jest.fn();
  const reprint = jest.fn();
  const open = jest.fn();
  const handleError = jest.fn();
  const originalProduction = environment.production;
  const config: TerminalReceiptSettings = {
    config: {
      version: 1,
      paperProfile: "58mm",
      header: "Original Store",
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
  const job: PrintJob = {
    id: "job",
    saleId: "sale",
    invoiceNumber: "INV-1",
    isCopy: false,
    copyCount: 1,
    status: "failed_not_sent",
    error: "No printer selected",
    createdAt: "2026-10-14",
    attempts: [
      {
        id: 1,
        printer: "none",
        status: "failed_not_sent",
        error: "No printer selected",
        layout: {
          version: 1,
          paperWidthMm: 58,
          columns: 32,
          lines: ["Original Store", "1.5 x 125.50", "TOTAL PKR 185.00"],
        },
        escpos: [27, 64, 10],
        createdAt: "2026-10-14",
        finishedAt: "2026-10-14",
      },
    ],
  };
  const record: ReceiptHistory = {
    receipts: [
      { saleId: "sale", invoiceNumber: "INV-1", createdAt: "2026-10-14" },
    ],
    jobs: [job],
    workerError: null,
  };
  const render = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const click = (text: string): void => {
    const button = Array.from<HTMLButtonElement>(
      fixture.nativeElement.querySelectorAll("button"),
    ).find((button) => button.textContent?.trim() === text);
    if (!button) {
      throw new Error(`Missing button ${text}`);
    }
    button.click();
  };
  const submit = (): void => {
    fixture.nativeElement
      .querySelector("form")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    environment.production = false;
    settings.mockResolvedValue(config);
    history.mockResolvedValue(record);
    saveSettings.mockResolvedValue(undefined);
    retry.mockResolvedValue(undefined);
    reprint.mockResolvedValue(undefined);
    open.mockReturnValue({ afterClosed: () => of(true) });
    await TestBed.configureTestingModule({
      imports: [ReceiptJobsPage],
      providers: [
        {
          provide: PrintingGateway,
          useValue: { settings, history, saveSettings, retry, reprint },
        },
        { provide: MatDialog, useValue: { open } },
        { provide: ErrorHandler, useValue: { handleError } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ReceiptJobsPage);
  });

  afterEach(() => {
    fixture.destroy();
    environment.production = originalProduction;
  });

  it("loads persisted settings and distinguishes print failures from the saved sale", async () => {
    await render();
    expect(settings).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain(
      "Failed - definitely not sent",
    );
    expect(fixture.nativeElement.textContent).toContain("No printer selected");
    expect(fixture.nativeElement.textContent).toContain(
      "Physical printers are not implemented",
    );
    const header: HTMLTextAreaElement = fixture.nativeElement.querySelector(
      '[formControlName="header"]',
    );
    expect(header.value).toBe("Original Store");
    submit();
    await render();
    expect(saveSettings).toHaveBeenCalledWith(config);
  });

  it("displays saved Rust output verbatim without rendering a new receipt", async () => {
    await render();
    click("Inspect generated output #1");
    await render();
    expect(fixture.nativeElement.querySelector("pre").textContent).toBe(
      job.attempts[0].layout?.lines.join("\n"),
    );
    expect(fixture.nativeElement.querySelector("pre").style.width).toBe("32ch");
    expect(fixture.nativeElement.textContent).toContain("27 64 10");
  });

  it("retries definitely-not-sent jobs without claiming uncertain confirmation", async () => {
    await render();
    click("Retry receipt only");
    await render();
    expect(retry).toHaveBeenCalledWith("job", false);
    expect(open).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain(
      "Sale, stock, and payments are unchanged",
    );
    expect(reprint).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation for uncertain delivery and honors cancellation", async () => {
    history.mockResolvedValue({
      ...record,
      jobs: [{ ...job, status: "uncertain" }],
    });
    open.mockReturnValueOnce({ afterClosed: () => of(false) });
    await render();
    click("Retry receipt only");
    await render();
    expect(retry).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(expect.anything(), {
      data: expect.objectContaining({
        body: expect.stringContaining("duplicate receipt"),
      }),
    });
    click("Retry receipt only");
    await render();
    expect(retry).toHaveBeenCalledWith("job", true);
  });

  it("queues COPY only after confirmation and does not submit a sale", async () => {
    await render();
    click("Queue COPY");
    await render();
    expect(reprint).toHaveBeenCalledWith("sale");
    expect(retry).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(expect.anything(), {
      data: expect.objectContaining({
        body: expect.stringContaining("original saved receipt"),
      }),
    });
  });

  it("surfaces native action and worker failures without clearing history", async () => {
    history.mockResolvedValue({
      ...record,
      workerError: "Storage unavailable",
    });
    retry.mockImplementation(async () => {
      throw new Error("Retry rejected");
    });
    await render();
    click("Retry receipt only");
    await render();
    expect(fixture.nativeElement.textContent).toContain("Retry rejected");
    expect(fixture.nativeElement.textContent).toContain("Storage unavailable");
    expect(fixture.nativeElement.textContent).toContain("INV-1");
  });

  it("does not offer retry for pending sending or completed virtual jobs", async () => {
    history.mockResolvedValue({
      ...record,
      jobs: ["pending", "sending", "virtual_output"].map((status) => ({
        ...job,
        id: status,
        status,
      })),
    });
    await render();
    expect(fixture.nativeElement.textContent).not.toContain(
      "Retry receipt only",
    );
    expect(fixture.nativeElement.textContent).toContain(
      "NOT physically printed",
    );
  });

  it("reports startup failure without enabling uninitialized settings", async () => {
    settings.mockImplementation(async () => {
      throw new Error("Desktop app required");
    });
    await render();
    expect(fixture.nativeElement.textContent).toContain("Desktop app required");
    expect(fixture.nativeElement.querySelector("form")).toBeNull();
    expect(history).not.toHaveBeenCalled();
  });

  it("ignores a late settings result after navigation", async () => {
    let finish!: (value: TerminalReceiptSettings) => void;
    settings.mockReturnValue(
      new Promise<TerminalReceiptSettings>((resolve) => {
        finish = resolve;
      }),
    );
    fixture.detectChanges();
    fixture.destroy();
    finish(config);
    await Promise.resolve();
    expect(history).not.toHaveBeenCalled();
  });

  it("production hides virtual simulation controls", async () => {
    environment.production = true;
    fixture.destroy();
    fixture = TestBed.createComponent(ReceiptJobsPage);
    await render();
    expect(
      fixture.nativeElement.querySelector('[formControlName="virtualOutcome"]'),
    ).toBeNull();
  });

  it("clears a persisted development failure mode when saving in production", async () => {
    environment.production = true;
    settings.mockResolvedValue({ ...config, virtualOutcome: "interrupted" });
    fixture.destroy();
    fixture = TestBed.createComponent(ReceiptJobsPage);
    await render();
    submit();
    await render();
    expect(saveSettings).toHaveBeenCalledWith({
      ...config,
      virtualOutcome: "success",
    });
  });
});
