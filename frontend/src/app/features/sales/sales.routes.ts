import { Routes } from "@angular/router";

import { SaleDetailPage } from "./pages/sale-detail/sale-detail.page";
import { SaleRegisterPage } from "./pages/sale-register/sale-register.page";

export const SALE_ROUTES: Routes = [
  { path: "", component: SaleRegisterPage, title: "Sales register | Counter" },
  { path: ":id", component: SaleDetailPage, title: "Sale | Counter" },
];
