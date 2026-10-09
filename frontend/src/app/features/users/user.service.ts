import { Injectable, inject } from "@angular/core";
import {
  BehaviorSubject,
  Observable,
  from,
  map,
  switchMap,
} from "rxjs";

import { AuthService } from "../../core/auth/auth.service";
import { CreateUserInput, UpdateUserInput } from "./user-input.model";
import { UserValidationError } from "./user.errors";
import { UserRepository } from "./user.repository";
import { User } from "./user.model";
import {
  UserFilters,
  UserPage,
  UserPageRequest,
} from "./user-query.model";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;

@Injectable({ providedIn: "root" })
export class UserService {
  private readonly auth = inject(AuthService);
  private readonly repository = inject(UserRepository);
  /** Bumped after every mutation so open list pages reload. */
  private readonly changes = new BehaviorSubject<void>(undefined);

  watchPage(
    filters: UserFilters,
    request: UserPageRequest,
  ): Observable<UserPage> {
    this.requireOwner();
    return this.changes.pipe(
      switchMap(() => from(this.repository.list())),
      map((users) => paginate(users, filters, request)),
    );
  }

  async findById(id: string): Promise<User | null> {
    this.requireOwner();
    return this.repository.findById(requireUuid(id, "id"));
  }

  async create(input: CreateUserInput): Promise<string> {
    this.requireOwner();
    requireObject(input, "user");
    const id = await this.repository.create({
      name: requiredText(input.name, "name", 255),
      email: requiredEmail(input.email),
      password: requiredPassword(input.password),
    });
    this.changes.next();
    return id;
  }

  async update(id: string, input: UpdateUserInput): Promise<void> {
    this.requireOwner();
    requireObject(input, "user changes");
    await this.repository.update(requireUuid(id, "id"), {
      name: requiredText(input.name, "name", 255),
      email: requiredEmail(input.email),
    });
    this.changes.next();
  }

  async delete(id: string): Promise<void> {
    this.requireOwner();
    const userId = requireUuid(id, "id");
    if (userId === this.auth.user()?.id) {
      throw new UserValidationError("You cannot delete your own account.");
    }
    await this.repository.remove(userId);
    this.changes.next();
  }

  private requireOwner(): void {
    const user = this.auth.user();
    if (user?.role !== "OWNER" || !user.storeId) {
      throw new UserValidationError(
        "Only the store owner can manage staff members.",
      );
    }
  }
}

function paginate(
  users: readonly User[],
  filters: UserFilters,
  request: UserPageRequest,
): UserPage {
  const search = filters.search.trim().toLowerCase();
  const direction = filters.sortDirection === "asc" ? 1 : -1;
  const matching = users
    .filter((user) => filters.role === "ALL" || user.role === filters.role)
    .filter(
      (user) =>
        search === "" ||
        user.name.toLowerCase().includes(search) ||
        user.email.toLowerCase().includes(search),
    )
    .sort((a, b) => direction * compare(a, b, filters.sortField));
  const start = request.pageIndex * request.pageSize;
  return {
    items: matching.slice(start, start + request.pageSize),
    total: matching.length,
  };
}

function compare(a: User, b: User, field: UserFilters["sortField"]): number {
  if (field === "lastLoginAt") {
    // Users who never signed in sort as the oldest.
    return (a.lastLoginAt ?? "").localeCompare(b.lastLoginAt ?? "");
  }
  return a[field].localeCompare(b[field], undefined, { sensitivity: "base" });
}

function requireObject(value: unknown, field: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new UserValidationError(`${field} must be an object.`);
  }
}

function requiredText(value: string, field: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new UserValidationError(`${field} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new UserValidationError(
      `${field} must be at most ${maxLength} characters.`,
    );
  }
  return normalized;
}

function requiredEmail(value: string): string {
  const email = requiredText(value, "email", 255);
  if (!EMAIL_PATTERN.test(email)) {
    throw new UserValidationError("email must be a valid email address.");
  }
  return email;
}

function requiredPassword(value: string): string {
  if (
    typeof value !== "string" ||
    value.length < MIN_PASSWORD_LENGTH ||
    value.length > MAX_PASSWORD_LENGTH ||
    !/[A-Za-z]/.test(value) ||
    !/\d/.test(value)
  ) {
    throw new UserValidationError(
      `Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters long and contain at least one letter and one digit.`,
    );
  }
  return value;
}

function requireUuid(value: string, field: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new UserValidationError(`${field} must be a valid UUID.`);
  }
  return value;
}
