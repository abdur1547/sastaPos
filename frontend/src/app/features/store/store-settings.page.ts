import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnInit,
  inject,
  signal,
} from "@angular/core";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSelectModule } from "@angular/material/select";
import { MatSnackBar } from "@angular/material/snack-bar";
import { firstValueFrom } from "rxjs";

import { AuthService } from "../../core/auth/auth.service";
import { applyApiError } from "../../core/http/api-form-error";
import { FormAlertComponent } from "../../shared/components/form-alert/form-alert.component";
import { FormFieldComponent } from "../../shared/components/form-field/form-field.component";
import { StoreApiService } from "./store-api.service";
import {
  StoreConfirmDialogComponent,
  StoreConfirmDialogData,
} from "./store-confirm-dialog.component";
import {
  Store,
  StoreSettings,
  StoreStatus,
  UpdateStoreRequest,
  UpdateStoreSettingsRequest,
} from "./store.model";

@Component({
  selector: "app-store-settings-page",
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    FormAlertComponent,
    FormFieldComponent,
  ],
  templateUrl: "./store-settings.page.html",
  styleUrl: "./store-settings.page.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoreSettingsPage implements OnInit {
  private readonly api = inject(StoreApiService);
  private readonly auth = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  protected readonly store = signal<Store | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal("");
  protected readonly saving = signal<"profile" | "settings" | null>(null);
  protected readonly profileError = signal("");
  protected readonly settingsError = signal("");

  protected readonly profileForm = new FormGroup({
    name: new FormControl("", {
      nonNullable: true,
      validators: [Validators.maxLength(255)],
    }),
    ntn: new FormControl("", {
      nonNullable: true,
      validators: [Validators.maxLength(255)],
    }),
    address: new FormControl("", {
      nonNullable: true,
      validators: [Validators.maxLength(1000)],
    }),
    currencyCode: new FormControl("", {
      nonNullable: true,
      validators: [Validators.maxLength(10)],
    }),
    timezone: new FormControl("", {
      nonNullable: true,
      validators: [Validators.maxLength(100)],
    }),
    status: new FormControl<StoreStatus>("ACTIVE", { nonNullable: true }),
  });

  protected readonly settingsForm = new FormGroup({
    invoicePrefix: new FormControl("", {
      nonNullable: true,
      validators: [Validators.maxLength(50)],
    }),
    invoiceNumberStart: new FormControl<number | null>(null, {
      validators: [
        Validators.required,
        Validators.min(0),
        Validators.max(2147483647),
        Validators.pattern(/^\d+$/),
      ],
    }),
    receiptFooter: new FormControl("", {
      nonNullable: true,
      validators: [Validators.maxLength(1000)],
    }),
  });

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set("");
    try {
      const store = await firstValueFrom(this.api.getStore());
      this.store.set(store);
      this.resetProfile();
      this.resetSettings();
    } catch (error) {
      this.loadError.set(
        error instanceof Error
          ? error.message
          : "Could not load store settings.",
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected resetProfile(): void {
    const store = this.store();
    if (!store) return;
    this.profileForm.reset({
      name: store.name,
      ntn: store.ntn,
      address: store.address ?? "",
      currencyCode: store.currencyCode ?? "",
      timezone: store.timezone ?? "",
      status: store.status,
    });
    this.profileError.set("");
  }

  protected resetSettings(): void {
    const settings = this.store()?.storeSettings;
    if (!settings) return;
    this.settingsForm.reset({
      invoicePrefix: settings.invoicePrefix ?? "",
      invoiceNumberStart: settings.invoiceNumberStart,
      receiptFooter: settings.receiptFooter ?? "",
    });
    this.settingsError.set("");
  }

  protected async saveProfile(): Promise<void> {
    this.profileForm.markAllAsTouched();
    const store = this.store();
    if (
      this.profileForm.invalid ||
      !this.profileForm.dirty ||
      this.saving() ||
      !store
    )
      return;
    this.saving.set("profile");
    this.profileError.set("");
    try {
      if (
        store.status !== "INACTIVE" &&
        this.profileForm.controls.status.value === "INACTIVE"
      ) {
        const confirmed = await this.confirm({
          title: "Deactivate this store?",
          message:
            "You are about to change the store status to inactive. This change is saved directly to the server.",
          confirmLabel: "Deactivate store",
        });
        if (!confirmed) return;
      }
      const controls = this.profileForm.controls;
      const values = this.profileForm.getRawValue();
      const request: UpdateStoreRequest = {
        ...(controls.name.dirty ? { name: values.name } : {}),
        ...(controls.ntn.dirty ? { ntn: values.ntn } : {}),
        ...(controls.address.dirty ? { address: values.address } : {}),
        ...(controls.currencyCode.dirty
          ? { currencyCode: values.currencyCode }
          : {}),
        ...(controls.timezone.dirty ? { timezone: values.timezone } : {}),
        ...(controls.status.dirty ? { status: values.status } : {}),
      };
      const updated = await firstValueFrom(this.api.updateStore(request));
      this.store.set(updated);
      this.resetProfile();
      // Do not overwrite unsaved invoice/receipt edits with the profile response.
      if (!this.settingsForm.dirty) this.resetSettings();
      this.snackBar.open("Store details saved", "Dismiss", { duration: 3000 });
    } catch (error) {
      this.profileError.set(applyApiError(this.profileForm, error));
    } finally {
      this.saving.set(null);
    }
  }

  protected async saveSettings(): Promise<void> {
    this.settingsForm.markAllAsTouched();
    if (
      this.settingsForm.invalid ||
      !this.settingsForm.dirty ||
      this.saving() ||
      !this.store()
    )
      return;
    this.saving.set("settings");
    this.settingsError.set("");
    try {
      const controls = this.settingsForm.controls;
      const values = this.settingsForm.getRawValue();
      const request: UpdateStoreSettingsRequest = {
        ...(controls.invoicePrefix.dirty
          ? { invoicePrefix: values.invoicePrefix }
          : {}),
        ...(controls.receiptFooter.dirty
          ? { receiptFooter: values.receiptFooter }
          : {}),
        ...(controls.invoiceNumberStart.dirty &&
        values.invoiceNumberStart !== null
          ? { invoiceNumberStart: values.invoiceNumberStart }
          : {}),
      };
      const settings: StoreSettings = await firstValueFrom(
        this.api.updateSettings(request),
      );
      this.store.update((store) =>
        store ? { ...store, storeSettings: settings } : store,
      );
      this.resetSettings();
      this.snackBar.open("Invoice and receipt settings saved", "Dismiss", {
        duration: 3000,
      });
    } catch (error) {
      this.settingsError.set(applyApiError(this.settingsForm, error));
    } finally {
      this.saving.set(null);
    }
  }

  async canLeave(): Promise<boolean> {
    if (!this.auth.isAuthenticated()) return true;
    if (this.saving()) return false;
    if (!this.profileForm.dirty && !this.settingsForm.dirty) return true;
    return this.confirm({
      title: "Discard unsaved changes?",
      message:
        "Your changes have not been saved to the server. Leave this page and discard them?",
      confirmLabel: "Discard changes",
    });
  }

  @HostListener("window:beforeunload", ["$event"])
  protected beforeUnload(event: BeforeUnloadEvent): void {
    if (this.saving() || this.profileForm.dirty || this.settingsForm.dirty)
      event.preventDefault();
  }

  private async confirm(data: StoreConfirmDialogData): Promise<boolean> {
    return (
      (await firstValueFrom(
        this.dialog
          .open<StoreConfirmDialogComponent, StoreConfirmDialogData, boolean>(
            StoreConfirmDialogComponent,
            { data, width: "440px" },
          )
          .afterClosed(),
      )) === true
    );
  }
}
