import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Router } from "@angular/router";
import { catchError, firstValueFrom, of, throwError } from "rxjs";

import { AuthService } from "../../core/auth/auth.service";
import { applyApiError } from "../../core/http/api-form-error";
import { ApiError } from "../../core/http/api-error.model";
import { OnlineService } from "../../core/network/online.service";
import {
  OnboardingProgressService,
  OnboardingStep,
} from "../../core/onboarding/onboarding-progress.service";
import { FormAlertComponent } from "../../shared/components/form-alert/form-alert.component";
import { FormFieldComponent } from "../../shared/components/form-field/form-field.component";
import { CustomerFormComponent } from "../customers/components/customer-form/customer-form.component";
import { CustomerFormValue } from "../customers/components/customer-form/customer-form.model";
import { CustomerTableComponent } from "../customers/components/customer-table/customer-table.component";
import { Customer } from "../customers/customer.model";
import { ProductFormComponent } from "../products/components/product-form/product-form.component";
import { ProductFormValue } from "../products/components/product-form/product-form.model";
import { ProductTableComponent } from "../products/components/product-table/product-table.component";
import { UnitOfMeasureOption } from "../products/product-lookup.model";
import { ProductListItem } from "../products/product-query.model";
import { StoreApiService } from "../store/store-api.service";
import { StoreSettingsPage } from "../store/store-settings.page";
import { UserFormComponent } from "../users/components/user-form/user-form.component";
import { UserFormValue } from "../users/components/user-form/user-form.model";
import { UserTableComponent } from "../users/components/user-table/user-table.component";
import { User } from "../users/user.model";
import { UserRepository } from "../users/user.repository";
import { OnboardingApiService, optionalText } from "./onboarding-api.service";

@Component({
  selector: "app-onboarding-page",
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    FormAlertComponent,
    FormFieldComponent,
    StoreSettingsPage,
    UserFormComponent,
    UserTableComponent,
    CustomerFormComponent,
    CustomerTableComponent,
    ProductFormComponent,
    ProductTableComponent,
  ],
  templateUrl: "./onboarding.page.html",
  styleUrl: "./onboarding.page.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly progress = inject(OnboardingProgressService);
  private readonly storeApi = inject(StoreApiService);
  private readonly api = inject(OnboardingApiService);
  private readonly userApi = inject(UserRepository);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly network = inject(OnlineService);

  protected readonly step = signal<OnboardingStep>(this.progress.step() ?? 0);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal("");
  protected readonly loadError = signal("");
  protected readonly storeCreated = signal(false);
  protected readonly users = signal<readonly User[]>([]);
  protected readonly customers = signal<readonly Customer[]>([]);
  protected readonly products = signal<readonly ProductListItem[]>([]);
  protected readonly units = signal<readonly UnitOfMeasureOption[]>([]);
  protected readonly productRows = computed(() =>
    this.products().map((product) => ({
      ...product,
      unitsOfMeasureName:
        this.units().find((unit) => unit.id === product.unitsOfMeasureId)
          ?.name ?? null,
    })),
  );
  protected readonly busy = computed(() => this.loading() || this.saving());
  protected readonly labels = [
    "Create store",
    "Store settings",
    "Staff",
    "Customers",
    "Products",
  ];

  private readonly staffForm = viewChild(UserFormComponent);
  private readonly customerForm = viewChild(CustomerFormComponent);
  private readonly productForm = viewChild(ProductFormComponent);
  private readonly settingsPage = viewChild(StoreSettingsPage);
  private pendingStoreUser: Parameters<AuthService["updateUser"]>[0] | null =
    null;

  protected readonly storeForm = inject(FormBuilder).nonNullable.group({
    name: [
      "",
      [
        Validators.required,
        Validators.maxLength(255),
        Validators.pattern(/\S/),
      ],
    ],
    ntn: [
      "",
      [
        Validators.required,
        Validators.maxLength(255),
        Validators.pattern(/\S/),
      ],
    ],
    address: ["", Validators.maxLength(1000)],
    currencyCode: ["PKR", [Validators.required, Validators.maxLength(10)]],
    timezone: [
      "Asia/Karachi",
      [Validators.required, Validators.maxLength(100)],
    ],
  });

  ngOnInit(): void {
    if (this.step() === 5) {
      void this.router.navigate(["/sell"]);
      return;
    }
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set("");
    try {
      this.network.requireOnline();
      if (this.step() === 0) {
        if (await this.recoverStore()) await this.resumeAfterStore();
      } else if (this.step() === 2) {
        this.users.set(await this.userApi.list());
      } else if (this.step() === 3) {
        this.customers.set(await this.api.customers());
      } else if (this.step() === 4) {
        const [units, products] = await Promise.all([
          this.api.units(),
          this.api.products(),
        ]);
        this.units.set(units);
        this.products.set(products);
      }
    } catch (error) {
      this.loadError.set(message(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected async createStore(): Promise<void> {
    if (this.busy()) return;
    this.storeForm.markAllAsTouched();
    if (this.storeForm.invalid) return;
    this.saving.set(true);
    this.error.set("");
    try {
      this.network.requireOnline();
      if (!this.storeCreated()) await this.recoverStore();
      if (!this.storeCreated()) {
        const value = this.storeForm.getRawValue();
        const response = await firstValueFrom(
          this.storeApi.createStore({
            ...value,
            name: value.name.trim(),
            ntn: value.ntn.trim(),
            currencyCode: value.currencyCode.trim().toUpperCase(),
            timezone: value.timezone.trim(),
          }),
        );
        this.pendingStoreUser = response.user;
        this.storeCreated.set(true);
        this.storeForm.markAsPristine();
      }
      await this.resumeAfterStore();
    } catch (error) {
      this.error.set(
        error instanceof ApiError
          ? applyApiError(this.storeForm, error)
          : message(error),
      );
    } finally {
      this.saving.set(false);
    }
  }

  private async resumeAfterStore(): Promise<void> {
    if (this.pendingStoreUser) {
      this.progress.save(0);
      await this.auth.updateUser(this.pendingStoreUser);
      this.pendingStoreUser = null;
    }
    this.progress.save(1);
    this.step.set(1);
  }

  /** Recover a committed POST whose response or session update was interrupted. */
  private async recoverStore(): Promise<boolean> {
    const store = await firstValueFrom(
      this.storeApi
        .getStore()
        .pipe(
          catchError((error: unknown) =>
            error instanceof ApiError && error.status === 404
              ? of(null)
              : throwError(() => error),
          ),
        ),
    );
    if (!store) return false;
    this.progress.save(0);
    await this.auth.refreshUser();
    this.storeCreated.set(true);
    return true;
  }

  protected async createStaff(value: UserFormValue): Promise<void> {
    await this.create(async () => {
      const id = await this.userApi.create({
        name: value.name.trim(),
        email: value.email.trim(),
        password: value.password,
      });
      this.users.update((users) => [
        ...users,
        {
          id,
          name: value.name.trim(),
          email: value.email.trim(),
          role: "CASHIER",
          status: "ACTIVE",
          lastLoginAt: null,
          storeId: this.auth.user()?.storeId ?? null,
        },
      ]);
      this.staffForm()?.reset();
    }, "Staff member created. Add another or continue.");
  }

  protected async createCustomer(value: CustomerFormValue): Promise<void> {
    await this.create(async () => {
      const customer = await this.api.createCustomer({
        name: value.name.trim(),
        phoneNumber: optionalText(value.phoneNumber),
        ntn: optionalText(value.ntn),
      });
      this.customers.update((customers) => [...customers, customer]);
      this.customerForm()?.reset();
    }, "Customer created. Add another or continue.");
  }

  protected async createProduct(value: ProductFormValue): Promise<void> {
    await this.create(async () => {
      const product = await this.api.createProduct(value);
      this.products.update((products) => [...products, product]);
      this.productForm()?.reset();
    }, "Product created. Add another or finish setup.");
  }

  private async create(
    operation: () => Promise<void>,
    success: string,
  ): Promise<void> {
    if (this.busy()) return;
    this.saving.set(true);
    this.error.set("");
    try {
      this.network.requireOnline();
      await operation();
      this.snackBar.open(success, "Dismiss", { duration: 4000 });
    } catch (error) {
      this.error.set(message(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected resetForm(): void {
    this.staffForm()?.reset();
    this.customerForm()?.reset();
    this.productForm()?.reset();
    this.error.set("");
  }

  protected async next(): Promise<void> {
    if (this.busy()) return;
    this.error.set("");
    try {
      this.network.requireOnline();
      if (!(await this.confirmDraft())) return;
      this.resetForm();
      const next = (this.step() + 1) as OnboardingStep;
      this.progress.save(next);
      this.step.set(next);
      if (next === 5) {
        await this.router.navigate(["/sell"]);
      } else {
        await this.load();
      }
    } catch (error) {
      this.error.set(message(error));
    }
  }

  async canLeave(): Promise<boolean> {
    if (!this.auth.isAuthenticated()) return true;
    if (this.busy()) return false;
    if (this.settingsPage()) return this.settingsPage()!.canLeave();
    return this.confirmDraft();
  }

  private async confirmDraft(): Promise<boolean> {
    return (
      !this.hasDraft() ||
      globalThis.confirm(
        "Discard the unsaved form? Records already created on the server will be kept.",
      )
    );
  }

  @HostListener("window:beforeunload", ["$event"])
  protected beforeUnload(event: BeforeUnloadEvent): void {
    if (this.busy() || this.hasDraft()) event.preventDefault();
  }

  private hasDraft(): boolean {
    const dirty =
      (this.storeForm.dirty && !this.storeCreated()) ||
      this.staffForm()?.hasDraft() ||
      this.customerForm()?.hasDraft() ||
      this.productForm()?.hasDraft();
    return !!dirty;
  }
}

function message(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Could not complete store setup. Please try again.";
}
