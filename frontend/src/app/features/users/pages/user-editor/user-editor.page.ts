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

import { UserFormValue } from "../../components/user-form/user-form.model";
import { UserFormComponent } from "../../components/user-form/user-form.component";
import { User } from "../../user.model";
import { UserService } from "../../user.service";

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly user: User | null }
  | { readonly status: "missing" }
  | { readonly status: "error"; readonly message: string };

/** Hosts the shared user form for both `/users/new` and `/users/:id`. */
@Component({
  selector: "app-user-editor-page",
  imports: [MatIconModule, RouterLink, UserFormComponent],
  templateUrl: "./user-editor.page.html",
  styleUrl: "./user-editor.page.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserEditorPage {
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly users = inject(UserService);

  protected readonly saving = signal(false);
  protected readonly saveError = signal("");

  protected readonly state = toSignal(
    inject(ActivatedRoute).paramMap.pipe(
      map((params) => params.get("id")),
      switchMap((id): ReturnType<typeof this.load> => this.load(id)),
    ),
    { initialValue: { status: "loading" } as LoadState },
  );

  protected readonly user = computed(() => {
    const state = this.state();
    return state.status === "ready" ? state.user : null;
  });
  protected readonly title = computed(() => (this.user() ? this.user()!.name : "New staff member"));

  protected async save(value: UserFormValue): Promise<void> {
    this.saving.set(true);
    this.saveError.set("");
    try {
      const user = this.user();
      if (user) {
        await this.users.update(user.id, { name: value.name, email: value.email });
      } else {
        await this.users.create({ name: value.name, email: value.email, password: value.password });
      }
      this.snackBar.open(user ? "Staff member updated" : "Staff member created", "Dismiss", { duration: 3000 });
      await this.goBack();
    } catch (error) {
      this.saveError.set(error instanceof Error ? error.message : "Could not save the staff member.");
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const user = this.user();
    if (!user || !globalThis.confirm(`Delete ${user.name}? This cannot be undone.`)) {
      return;
    }
    this.saving.set(true);
    this.saveError.set("");
    try {
      await this.users.delete(user.id);
      this.snackBar.open("Staff member deleted", "Dismiss", { duration: 3000 });
      await this.goBack();
    } catch (error) {
      this.saveError.set(error instanceof Error ? error.message : "Could not delete the staff member.");
    } finally {
      this.saving.set(false);
    }
  }

  protected goBack(): Promise<boolean> {
    return this.router.navigate(["/users"]);
  }

  private load(id: string | null) {
    if (!id || id === "new") {
      return of<LoadState>({ status: "ready", user: null });
    }
    return from(this.users.findById(id)).pipe(
      map((user): LoadState => (user ? { status: "ready", user } : { status: "missing" })),
      catchError((error: unknown) =>
        of<LoadState>({
          status: "error",
          message: error instanceof Error ? error.message : "Could not load the staff member.",
        }),
      ),
      startWith<LoadState>({ status: "loading" }),
    );
  }
}
