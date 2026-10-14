import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ErrorHandler,
  OnDestroy,
  OnInit,
  PendingTasks,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatDialog } from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { firstValueFrom, interval } from "rxjs";

import { environment } from "../../../environments/environment";
import {
  PrintAttempt,
  PrintJob,
  PrintJobStatus,
  PrintingGateway,
  ReceiptHistory,
  TerminalReceiptSettings,
} from "../../core/hardware/printing.gateway";
import { ReceiptConfig } from "../../core/hardware/receipt.gateway";
import { ReceiptConfirmDialogComponent } from "./receipt-confirm-dialog.component";

@Component({
  selector: "app-receipt-jobs-page",
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: "./receipt-jobs.page.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReceiptJobsPage implements OnInit, OnDestroy {
  private readonly gateway = inject(PrintingGateway);
  private readonly dialog = inject(MatDialog);
  private readonly errorHandler = inject(ErrorHandler);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pendingTasks = inject(PendingTasks);
  private readonly builder = inject(FormBuilder).nonNullable;
  private destroyed = false;
  private refreshing = false;

  protected readonly development = !environment.production;
  protected readonly ready = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal("");
  protected readonly notice = signal("");
  protected readonly history = signal<ReceiptHistory | null>(null);
  protected readonly selectedAttempt = signal<PrintAttempt | null>(null);
  protected readonly form = this.builder.group({
    paperProfile: this.builder.control<ReceiptConfig["paperProfile"]>("58mm"),
    header: [
      "",
      [Validators.maxLength(1000), Validators.pattern(/^[\x20-\x7e\n]*$/)],
    ],
    footer: [
      "",
      [Validators.maxLength(1000), Validators.pattern(/^[\x20-\x7e\n]*$/)],
    ],
    showSku: [false],
    showBarcode: [false],
    showCustomer: [true],
    autoPrint: [true],
    copyCount: [1, [Validators.required, Validators.min(1), Validators.max(5)]],
    printer: this.builder.control<TerminalReceiptSettings["printer"]>("none"),
    virtualOutcome:
      this.builder.control<TerminalReceiptSettings["virtualOutcome"]>(
        "success",
      ),
  });

  ngOnInit(): void {
    void this.pendingTasks.run(() => this.load());
  }

  private async load(): Promise<void> {
    try {
      const settings = await this.gateway.settings();
      if (this.destroyed) {
        return;
      }
      this.form.patchValue({
        ...settings.config,
        ...settings,
        virtualOutcome: this.development ? settings.virtualOutcome : "success",
      });
      this.ready.set(true);
      await this.refresh();
      if (this.destroyed) {
        return;
      }
      interval(1000)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          if (!this.busy() && !this.destroyed) {
            void this.refresh();
          }
        });
    } catch (error) {
      this.report(error);
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
  }

  protected async refresh(): Promise<void> {
    if (this.refreshing || this.destroyed) {
      return;
    }
    this.refreshing = true;
    try {
      const history = await this.gateway.history();
      if (!this.destroyed) {
        this.history.set(history);
      }
    } catch (error) {
      this.report(error);
    } finally {
      this.refreshing = false;
    }
  }

  protected async save(): Promise<void> {
    if (!this.ready() || this.busy()) {
      return;
    }
    if (
      this.form.invalid ||
      !Number.isInteger(this.form.controls.copyCount.value)
    ) {
      this.form.markAllAsTouched();
      this.error.set(
        "Use ASCII header/footer and a whole copy count between 1 and 5.",
      );
      return;
    }
    const value = this.form.getRawValue();
    await this.run(async () => {
      await this.gateway.saveSettings({
        config: {
          version: 1,
          paperProfile: value.paperProfile,
          header: value.header,
          footer: value.footer,
          showSku: value.showSku,
          showBarcode: value.showBarcode,
          showCustomer: value.showCustomer,
        },
        autoPrint: value.autoPrint,
        copyCount: value.copyCount,
        printer: value.printer,
        virtualOutcome: value.virtualOutcome,
      });
      this.notice.set(
        "Terminal settings saved. Existing receipts keep their original layout; failed jobs require manual retry.",
      );
    });
  }

  protected async retry(job: PrintJob): Promise<void> {
    if (this.busy() || !["failed_not_sent", "uncertain"].includes(job.status)) {
      return;
    }
    await this.run(async () => {
      const confirmed =
        job.status === "uncertain"
          ? await this.confirm(
              "Delivery may already have happened",
              "Retrying may produce a duplicate receipt. Check the output before continuing. This will not repeat the sale.",
              "Retry anyway",
            )
          : false;
      if (this.destroyed || (job.status === "uncertain" && !confirmed)) {
        return;
      }
      await this.gateway.retry(job.id, confirmed);
      this.notice.set(
        "Receipt retry queued. Sale, stock, and payments are unchanged.",
      );
    });
  }

  protected async reprint(saleId: string): Promise<void> {
    if (this.busy()) {
      return;
    }
    await this.run(async () => {
      if (
        !(await this.confirm(
          "Create a receipt copy",
          "Use the original saved receipt and layout with the currently selected printer. The receipt will be marked COPY. No sale or payment is created.",
          "Queue COPY",
        )) ||
        this.destroyed
      ) {
        return;
      }
      await this.gateway.reprint(saleId);
      this.notice.set(
        "Receipt COPY queued. Sale, stock, and payments are unchanged.",
      );
    });
  }

  protected statusLabel(status: PrintJobStatus): string {
    const labels: Record<PrintJobStatus, string> = {
      pending: "Queued",
      sending: "Delivery in progress / interrupted",
      virtual_output: "Virtual output saved - NOT physically printed",
      failed_not_sent: "Failed - definitely not sent",
      uncertain: "Uncertain delivery - confirmation required",
    };
    return labels[status];
  }

  protected inspect(attempt: PrintAttempt): void {
    this.selectedAttempt.set(attempt);
  }

  private async confirm(
    title: string,
    body: string,
    action: string,
  ): Promise<boolean> {
    return (
      (await firstValueFrom(
        this.dialog
          .open<ReceiptConfirmDialogComponent, object, boolean>(
            ReceiptConfirmDialogComponent,
            { data: { title, body, action } },
          )
          .afterClosed(),
      )) === true
    );
  }

  private async run(action: () => Promise<void>): Promise<void> {
    const done = this.pendingTasks.add();
    try {
      await this.perform(action);
    } finally {
      done();
    }
  }

  private async perform(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set("");
    this.notice.set("");
    this.form.disable();
    try {
      await action();
      await this.refresh();
    } catch (error) {
      this.report(error);
    } finally {
      if (!this.destroyed) {
        this.form.enable();
        this.busy.set(false);
      }
    }
  }

  private report(error: unknown): void {
    if (this.destroyed) {
      this.errorHandler.handleError(error);
    } else {
      this.error.set(error instanceof Error ? error.message : String(error));
    }
  }
}
