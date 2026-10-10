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
import { MatSnackBar } from "@angular/material/snack-bar";
import {
  RETURN_TO_PARAM,
  safeReturnUrl,
} from "../../../../core/navigation/return-navigation";
import { catchError, from, map, of, startWith, switchMap } from "rxjs";

import { CustomerFormValue } from "../../components/customer-form/customer-form.model";
import { CustomerFormComponent } from "../../components/customer-form/customer-form.component";
import { Customer } from "../../customer.model";
import { CustomerService } from "../../customer.service";

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly customer: Customer | null }
  | { readonly status: "missing" }
  | { readonly status: "error"; readonly message: string };

/** Hosts the shared customer form for both `/customers/new` and `/customers/:id`. */
@Component({
  selector: "app-customer-editor-page",
  imports: [MatIconModule, RouterLink, CustomerFormComponent],
  templateUrl: "./customer-editor.page.html",
  styleUrl: "./customer-editor.page.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerEditorPage {
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly customers = inject(CustomerService);

  private readonly route = inject(ActivatedRoute);

  /** Set when another screen (e.g. Sell) sent the user here and expects them back. */
  private readonly returnTo = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => safeReturnUrl(params.get(RETURN_TO_PARAM))),
    ),
    { initialValue: null },
  );
  protected readonly backUrl = computed(() => this.returnTo() ?? "/customers");
  protected readonly backLabel = computed(() =>
    this.returnTo() ? "Back" : "Customers",
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

  protected readonly customer = computed(() => {
    const state = this.state();
    return state.status === "ready" ? state.customer : null;
  });
  protected readonly title = computed(() =>
    this.customer() ? this.customer()!.name : "New customer",
  );

  protected async save(value: CustomerFormValue): Promise<void> {
    this.saving.set(true);
    this.saveError.set("");
    try {
      const customer = this.customer();
      let created: { id: string } | null = null;
      if (customer) {
        await this.customers.update(customer.id, {
          name: value.name,
          phoneNumber: emptyToNull(value.phoneNumber),
          ntn: emptyToNull(value.ntn),
          status: value.status,
        });
      } else {
        created = await this.customers.create({
          name: value.name,
          phoneNumber: emptyToNull(value.phoneNumber),
          ntn: emptyToNull(value.ntn),
        });
      }
      this.snackBar.open(
        customer ? "Customer updated" : "Customer created",
        "Dismiss",
        { duration: 3000 },
      );
      await this.goBack(created?.id);
    } catch (error) {
      this.saveError.set(
        error instanceof Error ? error.message : "Could not save the customer.",
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
    return this.router.navigate(["/customers"]);
  }

  private load(id: string | null) {
    if (!id || id === "new") {
      return of<LoadState>({ status: "ready", customer: null });
    }
    return from(this.customers.findById(id)).pipe(
      map((customer): LoadState =>
        customer ? { status: "ready", customer } : { status: "missing" },
      ),
      catchError((error: unknown) =>
        of<LoadState>({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Could not load the customer.",
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

/** Hands the new entity back to the originating screen, which selects it. */
function withCreatedId(url: string, createdId: string | undefined): string {
  if (!createdId) {
    return url;
  }
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}newCustomerId=${encodeURIComponent(createdId)}`;
}
