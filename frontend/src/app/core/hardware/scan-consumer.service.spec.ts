import { TestBed } from "@angular/core/testing";

import { ScanConsumerService } from "./scan-consumer.service";
import { ScannerEvent } from "./scanner.gateway";

describe("ScanConsumerService", () => {
  const scan: ScannerEvent = {
    type: "scan",
    sessionId: "1",
    scanId: "1:1",
    barcode: "036000291452",
  };

  it("delivers only to the active consumer, including after old cleanup", () => {
    const service = TestBed.inject(ScanConsumerService);
    const first = jest.fn();
    const second = jest.fn();
    const old = service.activate(first, jest.fn());
    const current = service.activate(second, jest.fn());
    old.receive(scan);
    old.release();
    current.receive(scan);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("036000291452");
  });

  it("deduplicates records, not repeated barcode values", () => {
    const receive = jest.fn();
    const consumer = TestBed.inject(ScanConsumerService).activate(
      receive,
      jest.fn(),
    );
    consumer.receive(scan);
    consumer.receive(scan);
    consumer.receive({ ...scan, scanId: "1:2" });
    consumer.receive({ ...scan, sessionId: "2" });
    expect(receive).toHaveBeenCalledTimes(3);
  });

  it("drops released records instead of replaying them to the next consumer", () => {
    const service = TestBed.inject(ScanConsumerService);
    const receive = jest.fn();
    const old = service.activate(receive, jest.fn());
    old.release();
    old.receive(scan);
    service.activate(receive, jest.fn());
    old.receive(scan);
    expect(receive).not.toHaveBeenCalled();
  });

  it("reports scanner errors separately from barcodes", () => {
    const receive = jest.fn();
    const error = jest.fn();
    const consumer = TestBed.inject(ScanConsumerService).activate(
      receive,
      error,
    );
    consumer.receive({
      type: "error",
      sessionId: "1",
      message: "Invalid frame",
    });
    expect(error).toHaveBeenCalledWith("Invalid frame");
    expect(receive).not.toHaveBeenCalled();
  });

  it("drops suspended records permanently while preserving deduplication", () => {
    const receive = jest.fn();
    const error = jest.fn();
    let enabled = true;
    const consumer = TestBed.inject(ScanConsumerService).activate(
      receive,
      error,
      () => enabled,
    );
    consumer.receive(scan);
    enabled = false;
    consumer.receive({ ...scan, scanId: "1:2" });
    consumer.receive({
      type: "error",
      sessionId: "1",
      message: "Suspended error",
    });
    enabled = true;
    consumer.receive(scan);
    consumer.receive({ ...scan, scanId: "1:2" });
    expect(receive).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    consumer.receive({ ...scan, scanId: "1:3" });
    expect(receive).toHaveBeenCalledTimes(2);
  });
});
