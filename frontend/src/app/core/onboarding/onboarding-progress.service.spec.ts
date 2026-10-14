import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";

import { AuthenticatedUser } from "../auth/auth.model";
import { AuthService } from "../auth/auth.service";
import { onboardingAccessGuard, setupRequiredGuard } from "./onboarding.guard";
import { OnboardingProgressService } from "./onboarding-progress.service";

describe("onboarding checkpoints and guards", () => {
  const user = signal<AuthenticatedUser | null>(null);
  const owner: AuthenticatedUser = {
    id: "owner",
    name: "Owner",
    email: "owner@example.com",
    role: "OWNER",
    status: "ACTIVE",
    storeId: null,
  };
  const router = { createUrlTree: jest.fn(() => "redirect") };
  let progress: OnboardingProgressService;

  beforeEach(() => {
    localStorage.clear();
    user.set(owner);
    router.createUrlTree.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user } },
        { provide: Router, useValue: router },
      ],
    });
    progress = TestBed.inject(OnboardingProgressService);
  });

  it("requires new owners to create a store, but not existing owners or cashiers", () => {
    expect(progress.step()).toBe(0);
    expect(progress.required()).toBe(true);
    user.set({ ...owner, storeId: "store" });
    expect(progress.required()).toBe(false);
    user.set({ ...owner, role: "CASHIER", storeId: "store" });
    expect(progress.required()).toBe(false);
  });

  it("requires storeless signup cashiers to start setup even with a stale completed checkpoint", () => {
    user.set({ ...owner, role: "CASHIER" });
    localStorage.setItem("counter:onboarding:owner", "5");
    expect(progress.step()).toBe(0);
    expect(progress.required()).toBe(true);
  });

  it("persists only a per-user checkpoint and resumes after a new service instance", () => {
    user.set({ ...owner, storeId: "store" });
    progress.save(3);
    const restored = TestBed.runInInjectionContext(
      () => new OnboardingProgressService(),
    );
    expect(restored.step()).toBe(3);
    expect(localStorage.getItem("counter:onboarding:owner")).toBe("3");
    user.set({ ...owner, id: "another", storeId: "store-2" });
    expect(progress.step()).toBeNull();
    user.set({ ...owner, storeId: "store" });
    progress.save(5);
    expect(progress.required()).toBe(false);
  });

  it("ignores invalid checkpoints", () => {
    localStorage.setItem("counter:onboarding:owner", "garbage");
    expect(progress.step()).toBe(0);
  });

  it("redirects unfinished owners and allows setup itself", () => {
    const guard = (url: string) =>
      TestBed.runInInjectionContext(() =>
        setupRequiredGuard(
          {} as Parameters<typeof setupRequiredGuard>[0],
          { url } as Parameters<typeof setupRequiredGuard>[1],
        ),
      );
    expect(guard("/sell")).toBe("redirect");
    expect(router.createUrlTree).toHaveBeenCalledWith(["/onboarding"]);
    expect(guard("/onboarding")).toBe(true);
    user.set({ ...owner, storeId: "store" });
    progress.save(5);
    expect(guard("/sell")).toBe(true);
  });

  it("allows storeless signup cashiers and owners, but not store-associated cashiers or admins", () => {
    const guard = () =>
      TestBed.runInInjectionContext(() =>
        onboardingAccessGuard(
          {} as Parameters<typeof onboardingAccessGuard>[0],
          {} as Parameters<typeof onboardingAccessGuard>[1],
        ),
      );
    expect(guard()).toBe(true);
    user.set({ ...owner, role: "CASHIER" });
    expect(guard()).toBe(true);
    user.set({ ...owner, role: "CASHIER", storeId: "store" });
    expect(guard()).toBe("redirect");
    user.set({ ...owner, role: "GLOBAL_ADMIN" });
    expect(guard()).toBe("redirect");
  });
});
