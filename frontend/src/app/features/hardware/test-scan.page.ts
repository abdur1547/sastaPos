import {
  ChangeDetectionStrategy,
  Component,
  ErrorHandler,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";

import {
  ScannerEvent,
  ScannerGateway,
  ScannerSimulation,
} from "../../core/hardware/scanner.gateway";

@Component({
  selector: "app-test-scan-page",
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: "./test-scan.page.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestScanPage implements OnInit, OnDestroy {
  private readonly gateway = inject(ScannerGateway);
  private readonly errorHandler = inject(ErrorHandler);
  private simulation: ScannerSimulation | null = null;
  private destroyed = false;

  protected readonly barcode = new FormControl("036000291452", {
    nonNullable: true,
  });
  protected readonly chunk = new FormControl("", { nonNullable: true });
  protected readonly ready = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal("");
  protected readonly status = signal("Starting simulator...");
  protected readonly lastScan = signal<Extract<
    ScannerEvent,
    { type: "scan" }
  > | null>(null);
  protected readonly scanCount = signal(0);

  async ngOnInit(): Promise<void> {
    try {
      const simulation = await this.gateway.openSimulator((event) =>
        this.receive(event),
      );
      if (this.destroyed) {
        await simulation.close();
        return;
      }
      this.simulation = simulation;
      this.ready.set(true);
      this.status.set("Ready. Framing: CR (carriage return).");
    } catch (error) {
      this.reportError(error);
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.ready.set(false);
    if (this.simulation) {
      void this.simulation
        .close()
        .catch((error: unknown) => this.errorHandler.handleError(error));
      this.simulation = null;
    }
  }

  protected scanOnce(): Promise<void> {
    return this.send(`${this.barcode.value}\r`);
  }

  protected sendChunk(): Promise<void> {
    return this.send(this.chunk.value.replace(/\\r/g, "\r"));
  }

  protected sendTerminator(): Promise<void> {
    return this.send("\r");
  }

  private async send(chunk: string): Promise<void> {
    if (!this.simulation || !this.ready() || this.busy()) {
      return;
    }
    this.error.set("");
    this.status.set("Input sent. Waiting for a CR-terminated barcode.");
    this.busy.set(true);
    try {
      await this.simulation.sendChunk(chunk);
    } catch (error) {
      this.reportError(error);
    } finally {
      this.busy.set(false);
    }
  }

  private receive(event: ScannerEvent): void {
    if (this.destroyed) {
      return;
    }
    if (event.type === "error") {
      this.error.set(event.message);
      this.status.set("Input rejected. No scan was created for that frame.");
      return;
    }
    this.lastScan.set(event);
    this.scanCount.update((count) => count + 1);
    this.status.set("Simulated scan received from Rust.");
  }

  private reportError(error: unknown): void {
    if (this.destroyed) {
      this.errorHandler.handleError(error);
      return;
    }
    this.error.set(error instanceof Error ? error.message : String(error));
    this.status.set("Simulator operation failed.");
  }
}
