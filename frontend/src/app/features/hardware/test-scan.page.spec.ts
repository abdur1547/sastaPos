import { ErrorHandler } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";

import {
  ScannerEvent,
  ScannerGateway,
  ScannerSimulation,
} from "../../core/hardware/scanner.gateway";
import { TestScanPage } from "./test-scan.page";

describe("TestScanPage", () => {
  let fixture: ComponentFixture<TestScanPage>;
  let receive: (event: ScannerEvent) => void;
  const sendChunk = jest.fn();
  const close = jest.fn();
  const openSimulator = jest.fn();
  const handleError = jest.fn();

  const render = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const button = (label: string): HTMLButtonElement => {
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll("button"),
    );
    const result = buttons.find(
      (element) => element.textContent?.trim() === label,
    );
    if (!result) {
      throw new Error(`Button not found: ${label}`);
    }
    return result;
  };
  const enter = (selector: string, value: string): void => {
    const input: HTMLInputElement | HTMLTextAreaElement =
      fixture.nativeElement.querySelector(selector);
    input.value = value;
    input.dispatchEvent(new Event("input"));
    fixture.detectChanges();
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    sendChunk.mockResolvedValue(undefined);
    close.mockResolvedValue(undefined);
    openSimulator.mockImplementation(
      async (callback: (event: ScannerEvent) => void) => {
        receive = callback;
        return { sendChunk, close } satisfies ScannerSimulation;
      },
    );
    await TestBed.configureTestingModule({
      imports: [TestScanPage],
      providers: [
        { provide: ScannerGateway, useValue: { openSimulator } },
        { provide: ErrorHandler, useValue: { handleError } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(TestScanPage);
  });

  it("labels simulation and only displays a scan after Rust delivers its event", async () => {
    await render();
    expect(fixture.nativeElement.textContent).toContain(
      "no physical device connected",
    );
    button("Scan Once").click();
    await render();
    expect(sendChunk).toHaveBeenCalledWith("036000291452\r");
    expect(fixture.nativeElement.textContent).toContain("Received scans: 0");
    receive({
      type: "scan",
      sessionId: "1",
      scanId: "1:1",
      barcode: "036000291452",
    });
    receive({
      type: "scan",
      sessionId: "1",
      scanId: "1:2",
      barcode: "036000291452",
    });
    await render();
    expect(fixture.nativeElement.textContent).toContain("Received scans: 2");
    expect(fixture.nativeElement.querySelector("dd").textContent).toBe(
      "036000291452",
    );
  });

  it("sends partial chunks unchanged and decodes explicit CR framing", async () => {
    await render();
    enter("textarea", "036000");
    button("Send chunk").click();
    await render();
    expect(sendChunk).toHaveBeenLastCalledWith("036000");
    enter("textarea", "291452\\r001\\r");
    button("Send chunk").click();
    await render();
    expect(sendChunk).toHaveBeenLastCalledWith("291452\r001\r");
    button("Send CR").click();
    await render();
    expect(sendChunk).toHaveBeenLastCalledWith("\r");
  });

  it("shows parser and command failures without incrementing scan count", async () => {
    await render();
    receive({
      type: "error",
      sessionId: "1",
      message: "Barcode must not be empty.",
    });
    await render();
    expect(
      fixture.nativeElement.querySelector('[role="alert"]').textContent,
    ).toContain("must not be empty");
    sendChunk.mockImplementationOnce(async () => {
      throw "Session expired";
    });
    button("Scan Once").click();
    await render();
    expect(
      fixture.nativeElement.querySelector('[role="alert"]').textContent,
    ).toContain("Session expired");
    expect(fixture.nativeElement.textContent).toContain("Received scans: 0");
  });

  it("disables sending and exposes startup failure", async () => {
    openSimulator.mockImplementationOnce(async () => {
      throw new Error("Desktop app required");
    });
    await render();
    expect(button("Scan Once").disabled).toBe(true);
    expect(
      fixture.nativeElement.querySelector('[role="alert"]').textContent,
    ).toContain("Desktop app required");
  });

  it("closes on destruction and ignores late delivery", async () => {
    await render();
    fixture.destroy();
    receive({ type: "scan", sessionId: "1", scanId: "1:1", barcode: "001" });
    expect(close).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).not.toContain("Last barcode");
  });

  it("closes a session that finishes opening after navigation away", async () => {
    let resolve: (value: ScannerSimulation) => void = () => {
      throw new Error("No pending start");
    };
    openSimulator.mockReturnValueOnce(
      new Promise<ScannerSimulation>((done) => {
        resolve = done;
      }),
    );
    fixture.detectChanges();
    fixture.destroy();
    resolve({ sendChunk, close });
    await fixture.whenStable();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("reports cleanup errors to the application error handler", async () => {
    await render();
    close.mockRejectedValueOnce(new Error("Stop failed"));
    fixture.destroy();
    await fixture.whenStable();
    expect(handleError).toHaveBeenCalledWith(new Error("Stop failed"));
  });
});
