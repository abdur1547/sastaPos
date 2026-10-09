import { Injectable } from "@angular/core";
import { Observable, firstValueFrom, map } from "rxjs";

import { ApiError } from "../../core/http/api-error.model";
import { BaseApiService } from "../../core/http/base-api.service";
import { CreateUserInput, UpdateUserInput } from "./user-input.model";
import {
  UserConflictError,
  UserNotFoundError,
  UserPersistenceError,
} from "./user.errors";
import { User, UserRole, UserStatus } from "./user.model";

/** Mirrors the backend `UserDTO`. */
interface UserResponse {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly lastLoginAt: string | null;
  readonly store: string | null;
}

/** HTTP-only access to `/api/users`; holds no state. */
@Injectable({ providedIn: "root" })
export class UserRepository extends BaseApiService {
  list(): Promise<readonly User[]> {
    return this.run(
      this.get<UserResponse[]>("/api/users").pipe(
        map((rows) => rows.map(toUser)),
      ),
    );
  }

  async findById(id: string): Promise<User | null> {
    try {
      return await this.run(
        this.get<UserResponse>(`/api/users/${id}`).pipe(map(toUser)),
        id,
      );
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  create(input: CreateUserInput): Promise<string> {
    return this.run(this.post<string, CreateUserInput>("/api/users", input));
  }

  async update(id: string, input: UpdateUserInput): Promise<void> {
    await this.run(
      this.put<string, UpdateUserInput>(`/api/users/${id}`, input),
      id,
    );
  }

  async remove(id: string): Promise<void> {
    await this.run(this.delete<void>(`/api/users/${id}`), id);
  }

  private async run<T>(request: Observable<T>, id = ""): Promise<T> {
    try {
      return await firstValueFrom(request);
    } catch (error) {
      throw translate(error, id);
    }
  }
}

function toUser(row: UserResponse): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    lastLoginAt: row.lastLoginAt,
    storeId: row.store,
  };
}

function translate(error: unknown, id: string): Error {
  if (!(error instanceof ApiError)) {
    return new UserPersistenceError("Something went wrong. Please try again.");
  }
  if (error.status === 404) {
    return new UserNotFoundError(id);
  }
  if (error.status === 409) {
    return new UserConflictError(error.message);
  }
  return error;
}
