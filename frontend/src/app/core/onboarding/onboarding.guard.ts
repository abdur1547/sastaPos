import { inject } from "@angular/core";
import { CanActivateChildFn, CanActivateFn, Router } from "@angular/router";

import { AuthService } from "../auth/auth.service";
import { OnboardingProgressService } from "./onboarding-progress.service";

export const setupRequiredGuard: CanActivateChildFn = (_route, state) =>
  state.url.split(/[?#]/)[0] === "/onboarding" ||
  !inject(OnboardingProgressService).required() ||
  inject(Router).createUrlTree(["/onboarding"]);

export const onboardingAccessGuard: CanActivateFn = () => {
  const user = inject(AuthService).user();
  return (
    user?.role === "OWNER" ||
    (user?.role === "CASHIER" && !user.storeId) ||
    inject(Router).createUrlTree(["/sell"])
  );
};
