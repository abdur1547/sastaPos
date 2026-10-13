import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";

import { AuthService } from "../../core/auth/auth.service";
import { storeOwnerGuard } from "./store.routes";

describe("storeOwnerGuard", () => {
  it.each(["OWNER", "CASHIER", "GLOBAL_ADMIN", null])(
    "only permits OWNER, not %s",
    (role) => {
      const redirect = {};
      const router = { createUrlTree: jest.fn(() => redirect) };
      TestBed.configureTestingModule({
        providers: [
          {
            provide: AuthService,
            useValue: { user: () => (role ? { role } : null) },
          },
          { provide: Router, useValue: router },
        ],
      });
      const result = TestBed.runInInjectionContext(() =>
        storeOwnerGuard({} as never, {} as never),
      );
      expect(result).toBe(role === "OWNER" ? true : redirect);
      if (role !== "OWNER")
        expect(router.createUrlTree).toHaveBeenCalledWith(["/sell"]);
    },
  );
});
