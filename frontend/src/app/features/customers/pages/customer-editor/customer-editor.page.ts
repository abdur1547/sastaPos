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

  protected readonly saving = signal(false);
  protected readonly saveError = signal("");

  protected readonly state = toSignal(
    inject(ActivatedRoute).paramMap.pipe(
      map((params) => params.get("id")),
      switchMap((id): ReturnType<typeof this.load> => this.load(id)),
    ),
    { initialValue: { status: "loading" } as LoadState },
  );

  protected readonly customer = computed(() => {
    const state = this.state();
    return state.status === "ready" ? state.customer : null;
  });
  protected readonly title = computed(() => (this.customer() ? this.customer()!.name : "New customer"));

  protected async save(value: CustomerFormValue): Promise<void> {
    this.saving.set(true);
    this.saveError.set("");
    try {
      const customer = this.customer();
      if (customer) {
        await this.customers.update(customer.id, {
          name: value.name,
          phoneNumber: emptyToNull(value.phoneNumber),
          ntn: emptyToNull(value.ntn),
          status: value.status,
        });
      } else {
        await this.customers.create({
          name: value.name,
          phoneNumber: emptyToNull(value.phoneNumber),
          ntn: emptyToNull(value.ntn),
        });
      }
      this.snackBar.open(customer ? "Customer updated" : "Customer created", "Dismiss", { duration: 3000 });
      await this.goBack();
    } catch (error) {
      this.saveError.set(error instanceof Error ? error.message : "Could not save the customer.");
    } finally {
      this.saving.set(false);
    }
  }

  protected goBack(): Promise<boolean> {
    return this.router.navigate(["/customers"]);
  }

  private load(id: string | null) {
    if (!id || id === "new") {
      return of<LoadState>({ status: "ready", customer: null });
    }
    return from(this.customers.findById(id)).pipe(
      map((customer): LoadState => (customer ? { status: "ready", customer } : { status: "missing" })),
      catchError((error: unknown) =>
        of<LoadState>({
          status: "error",
          message: error instanceof Error ? error.message : "Could not load the customer.",
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
