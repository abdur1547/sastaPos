import { TestBed } from "@angular/core/testing";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { EventCallback } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

import { environment } from "../../../environments/environment";
import { ScannerEvent, ScannerGateway } from "./scanner.gateway";

jest.mock("@tauri-apps/api/core", () => ({
  invoke: jest.fn(),
  isTauri: jest.fn(),
}));
jest.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: jest.fn(() => ({ listen: jest.fn() })),
}));

describe("ScannerGateway", () => {
  let gateway: ScannerGateway;
  let listener: EventCallback<ScannerEvent>;
  const unlisten = jest.fn();
  const window = getCurrentWebviewWindow();
  const listen = jest.mocked(window.listen);
  const receive = jest.fn();
  const originalProduction = environment.production;

  const deliver = (payload: ScannerEvent): void => {
    listener({ event: "hardware://simulated-scan", id: 1, payload });
  };

  beforeEach(() => {
    jest.resetAllMocks();
    environment.production = false;
    jest.mocked(isTauri).mockReturnValue(true);
    listen.mockImplementation(
      async (_event: string, callback: EventCallback<ScannerEvent>) => {
        listener = callback;
        return unlisten;
      },
    );
    jest.mocked(getCurrentWebviewWindow).mockReturnValue(window);
    jest.mocked(invoke).mockResolvedValue("session-1");
    gateway = TestBed.inject(ScannerGateway);
  });

  afterEach(() => {
    environment.production = originalProduction;
  });

  it("listens before starting and forwards distinct records only from its session", async () => {
    const simulation = await gateway.openSimulator(receive);
    expect(listen).toHaveBeenCalledWith(
      "hardware://simulated-scan",
      expect.any(Function),
    );
    expect(listen.mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(invoke).mock.invocationCallOrder[0],
    );
    const first: ScannerEvent = {
      type: "scan",
      sessionId: "session-1",
      scanId: "1:1",
      barcode: "001",
    };
    deliver({ ...first, sessionId: "old-session" });
    deliver(first);
    deliver({ ...first, scanId: "1:2" });
    deliver({
      type: "error",
      sessionId: "session-1",
      message: "Invalid frame",
    });
    expect(receive).toHaveBeenCalledTimes(3);
    expect(receive).toHaveBeenNthCalledWith(1, first);
    await simulation.sendChunk("001\r");
    expect(invoke).toHaveBeenCalledWith("scanner_simulator_feed", {
      sessionId: "session-1",
      chunk: "001\r",
    });
    await simulation.close();
  });

  it("removes its listener and ignores late events after closing", async () => {
    const simulation = await gateway.openSimulator(receive);
    await simulation.close();
    await simulation.close();
    expect(unlisten).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("scanner_simulator_stop", {
      sessionId: "session-1",
    });
    deliver({
      type: "scan",
      sessionId: "session-1",
      scanId: "1:1",
      barcode: "001",
    });
    expect(receive).not.toHaveBeenCalled();
    await expect(simulation.sendChunk("001\r")).rejects.toThrow(
      "session is closed",
    );
  });

  it("cleans up on start failure and reports command errors without simulating success", async () => {
    jest.mocked(invoke).mockRejectedValueOnce(new Error("Start failed"));
    await expect(gateway.openSimulator(receive)).rejects.toThrow(
      "Start failed",
    );
    expect(unlisten).toHaveBeenCalledTimes(1);
    const simulation = await gateway.openSimulator(receive);
    jest.mocked(invoke).mockRejectedValueOnce(new Error("Input failed"));
    await expect(simulation.sendChunk("001\r")).rejects.toThrow("Input failed");
    expect(receive).not.toHaveBeenCalled();
    jest.mocked(invoke).mockRejectedValueOnce(new Error("Stop failed"));
    await expect(simulation.close()).rejects.toThrow("Stop failed");
    expect(unlisten).toHaveBeenCalledTimes(2);
  });

  it("reports listener setup failure before creating a native session", async () => {
    listen.mockRejectedValueOnce(new Error("Listen failed"));
    await expect(gateway.openSimulator(receive)).rejects.toThrow(
      "Listen failed",
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it("rejects browser use instead of bypassing Rust", async () => {
    jest.mocked(isTauri).mockReturnValue(false);
    await expect(gateway.openSimulator(receive)).rejects.toThrow(
      "Tauri desktop app",
    );
    expect(listen).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("rejects production use even inside Tauri", async () => {
    environment.production = true;
    await expect(gateway.openSimulator(receive)).rejects.toThrow(
      "development builds only",
    );
    expect(listen).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
});
