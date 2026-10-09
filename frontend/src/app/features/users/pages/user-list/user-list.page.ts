import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from "@angular/core";
import { toObservable, toSignal } from "@angular/core/rxjs-interop";
import { Router } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { catchError, map, of, startWith, switchMap } from "rxjs";

import { UserFiltersComponent } from "../../components/user-filters/user-filters.component";
import { UserTableComponent } from "../../components/user-table/user-table.component";
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_USER_FILTERS,
  PAGE_SIZE_OPTIONS,
  UserFilters,
  UserListItem,
  UserPage,
} from "../../user-query.model";
import { UserService } from "../../user.service";

interface PageState {
  readonly page: UserPage;
  readonly loading: boolean;
  readonly error: string;
}

const EMPTY_PAGE: UserPage = { items: [], total: 0 };

@Component({
  selector: "app-user-list-page",
  imports: [
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    UserFiltersComponent,
    UserTableComponent,
  ],
  templateUrl: "./user-list.page.html",
  styleUrl: "./user-list.page.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserListPage {
  private readonly router = inject(Router);
  private readonly users = inject(UserService);

  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly filters = signal<UserFilters>(DEFAULT_USER_FILTERS);
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);

  private readonly state = toSignal(
    toObservable(
      computed(() => ({
        filters: this.filters(),
        pageIndex: this.pageIndex(),
        pageSize: this.pageSize(),
      })),
    ).pipe(
      switchMap(({ filters, pageIndex, pageSize }) => {
        try {
          return this.users.watchPage(filters, { pageIndex, pageSize }).pipe(
            map((page): PageState => ({ page, loading: false, error: "" })),
            startWith<PageState>({ page: EMPTY_PAGE, loading: true, error: "" }),
            catchError((error: unknown) => of<PageState>(failed(error))),
          );
        } catch (error) {
          return of<PageState>(failed(error));
        }
      }),
    ),
    { initialValue: { page: EMPTY_PAGE, loading: true, error: "" } },
  );

  protected readonly items = computed(() => this.state().page.items);
  protected readonly total = computed(() => this.state().page.total);
  protected readonly loading = computed(() => this.state().loading);
  protected readonly error = computed(() => this.state().error);

  constructor() {
    // Deleting or filtering rows can leave the current page past the end.
    effect(() => {
      const state = this.state();
      if (!state.loading && state.page.items.length === 0 && state.page.total === 0 && this.pageIndex() > 0) {
        this.pageIndex.set(0);
      }
    });
  }

  protected onFiltersChange(filters: UserFilters): void {
    this.filters.set(filters);
    this.pageIndex.set(0);
  }

  protected onPage(event: PageEvent): void {
    this.pageSize.set(event.pageSize);
    this.pageIndex.set(event.pageIndex);
  }

  protected open(user: UserListItem): void {
    void this.router.navigate(["/users", user.id]);
  }

  protected add(): void {
    void this.router.navigate(["/users", "new"]);
  }
}

function failed(error: unknown): PageState {
  return {
    page: EMPTY_PAGE,
    loading: false,
    error: error instanceof Error ? error.message : "Could not load staff.",
  };
}
