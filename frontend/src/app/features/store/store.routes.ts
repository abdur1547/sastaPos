import { inject } from "@angular/core";
import {
  CanActivateFn,
  CanDeactivateFn,
  Router,
  Routes,
} from "@angular/router";

import { AuthService } from "../../core/auth/auth.service";
import { StoreSettingsPage } from "./store-settings.page";

export const storeOwnerGuard: CanActivateFn = () =>
  inject(AuthService).user()?.role === "OWNER" ||
  inject(Router).createUrlTree(["/sell"]);

export const storeSettingsLeaveGuard: CanDeactivateFn<StoreSettingsPage> = (
  page,
) => page.canLeave();

export const STORE_ROUTES: Routes = [
  {
    path: "",
    component: StoreSettingsPage,
    canActivate: [storeOwnerGuard],
    canDeactivate: [storeSettingsLeaveGuard],
    title: "Store settings | Counter",
  },
];
