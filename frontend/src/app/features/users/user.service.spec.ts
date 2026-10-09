import { TestBed } from "@angular/core/testing";
import { firstValueFrom } from "rxjs";

import { AuthService } from "../../core/auth/auth.service";
import { DEFAULT_USER_FILTERS } from "./user-query.model";
import { UserRepository } from "./user.repository";
import { UserService } from "./user.service";
import { User } from "./user.model";

const STORE_ID = "8f2fcf9e-44f8-45fc-a319-761910940071";
const OWNER_ID = "7b34a868-e7dd-4e39-8c24-4c301adf73fe";

function user(id: string, name: string, role: User["role"] = "CASHIER"): User {
  return {
    id,
    name,
    email: `${name.toLowerCase()}@example.com`,
    role,
    status: "ACTIVE",
    lastLoginAt: null,
    storeId: STORE_ID,
  };
}

describe("UserService", () => {
  const repository = {
    create: jest.fn(),
    findById: jest.fn(),
    list: jest.fn(),
    remove: jest.fn(),
    update: jest.fn(),
  };
  let role: string;
  let service: UserService;

  beforeEach(() => {
    jest.resetAllMocks();
    role = "OWNER";
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: { user: () => ({ id: OWNER_ID, role, storeId: STORE_ID }) },
        },
        { provide: UserRepository, useValue: repository },
      ],
    });
    service = TestBed.inject(UserService);
  });

  it("trims input and validates before creating a staff member", async () => {
    repository.create.mockResolvedValue(OWNER_ID);

    await service.create({ name: " Sara ", email: " sara@example.com ", password: "secret123" });

    expect(repository.create).toHaveBeenCalledWith({
      name: "Sara",
      email: "sara@example.com",
      password: "secret123",
    });
    await expect(
      service.create({ name: "Sara", email: "sara@example.com", password: "letters-only" }),
    ).rejects.toThrow("Password must be");
  });

  it("rejects non-owners and self-deletion", async () => {
    await expect(service.delete(OWNER_ID)).rejects.toThrow("cannot delete your own");
    role = "CASHIER";
    await expect(service.findById(OWNER_ID)).rejects.toThrow("Only the store owner");
  });

  it("filters, sorts and pages the staff list", async () => {
    repository.list.mockResolvedValue([
      user("a", "Zed"),
      user("b", "Amy"),
      user("c", "Boss", "OWNER"),
    ]);

    const page = await firstValueFrom(
      service.watchPage(
        { ...DEFAULT_USER_FILTERS, role: "CASHIER" },
        { pageIndex: 0, pageSize: 10 },
      ),
    );

    expect(page.total).toBe(2);
    expect(page.items.map((item) => item.name)).toEqual(["Amy", "Zed"]);
  });
});
