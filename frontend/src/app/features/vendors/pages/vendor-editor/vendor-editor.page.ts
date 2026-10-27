import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatSnackBar } from "@angular/material/snack-bar";
import { catchError, from, map, of, startWith, switchMap } from "rxjs";

import {
  RETURN_TO_PARAM,
  safeReturnUrl,
} from "../../../../core/navigation/return-navigation";
import { VendorFormValue } from "../../components/vendor-form/vendor-form.component";
import { VendorFormComponent } from "../../components/vendor-form/vendor-form.component";
import { Vendor } from "../../vendor.model";
import { VendorService } from "../../vendor.service";

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly vendor: Vendor | null }
  | { readonly status: "missing" }
  | { readonly status: "error"; readonly message: string };

@Component({
  selector: "app-vendor-editor-page",
  imports: [MatIconModule, MatButtonModule, RouterLink, VendorFormComponent],
  templateUrl: "./vendor-editor.page.html",
  styleUrl: "./vendor-editor.page.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VendorEditorPage {
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly vendors = inject(VendorService);
  private readonly route = inject(ActivatedRoute);

  private readonly returnTo = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => safeReturnUrl(params.get(RETURN_TO_PARAM))),
    ),
    { initialValue: null },
  );

  private readonly vendorId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get("id"))),
    { initialValue: null },
  );

  protected readonly backUrl = computed(() => {
    const id = this.vendorId();
    return this.returnTo() ?? (id && id !== "new" ? `/vendors/${id}/ledger` : "/vendors");
  });

  protected readonly backLabel = computed(() =>
    this.returnTo()
      ? "Back"
      : this.vendorId() && this.vendorId() !== "new"
        ? "Vendor Ledger"
        : "Vendors",
  );

  protected readonly saving = signal(false);
  protected readonly saveError = signal("");

  protected readonly state = toSignal(
    this.route.paramMap.pipe(
      map((params) => params.get("id")),
      switchMap((id): ReturnType<typeof this.load> => this.load(id)),
    ),
    { initialValue: { status: "loading" } as LoadState },
  );

  protected readonly vendor = computed(() => {
    const state = this.state();
    return state.status === "ready" ? state.vendor : null;
  });

  protected readonly errorMessage = computed(() => {
    const s = this.state();
    return s.status === "error" ? s.message : "";
  });

  protected readonly title = computed(() =>
    this.vendor() ? this.vendor()!.name : "New Vendor",
  );

  protected async save(value: VendorFormValue): Promise<void> {
    this.saving.set(true);
    this.saveError.set("");
    try {
      const vendor = this.vendor();
      let created: { id: string } | null = null;

      if (vendor) {
        await this.vendors.update(vendor.id, {
          name: value.name,
          phoneNumber: emptyToNull(value.phoneNumber),
          ntn: emptyToNull(value.ntn),
          strn: emptyToNull(value.strn),
          salesTaxRegistrationStatus: value.salesTaxRegistrationStatus,
          address: emptyToNull(value.address),
          status: value.status,
        });
      } else {
        created = await this.vendors.create({
          name: value.name,
          phoneNumber: emptyToNull(value.phoneNumber),
          ntn: emptyToNull(value.ntn),
          strn: emptyToNull(value.strn),
          salesTaxRegistrationStatus: value.salesTaxRegistrationStatus,
          address: emptyToNull(value.address),
        });
      }

      this.snackBar.open(
        vendor ? "Vendor updated" : "Vendor created",
        "Dismiss",
        { duration: 3000 },
      );
      await this.goBack(created?.id);
    } catch (error) {
      this.saveError.set(
        error instanceof Error ? error.message : "Could not save the vendor.",
      );
    } finally {
      this.saving.set(false);
    }
  }

  protected goBack(createdId?: string): Promise<boolean> {
    const returnTo = this.returnTo();
    if (returnTo) {
      return this.router.navigateByUrl(withCreatedId(returnTo, createdId));
    }
    return this.router.navigateByUrl(this.backUrl());
  }

  private load(id: string | null) {
    if (!id || id === "new") {
      return of<LoadState>({ status: "ready", vendor: null });
    }
    return from(this.vendors.findById(id)).pipe(
      map((vendor): LoadState =>
        vendor ? { status: "ready", vendor } : { status: "missing" },
      ),
      catchError((error: unknown) =>
        of<LoadState>({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Could not load the vendor.",
        }),
      ),
      startWith<LoadState>({ status: "loading" }),
    );
  }
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function withCreatedId(url: string, createdId: string | undefined): string {
  if (!createdId) {
    return url;
  }
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}newVendorId=${encodeURIComponent(createdId)}`;
}
