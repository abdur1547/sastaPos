import { Routes } from "@angular/router";

import { CustomerEditorPage } from "./pages/customer-editor/customer-editor.page";
import { CustomerListPage } from "./pages/customer-list/customer-list.page";

export const CUSTOMER_ROUTES: Routes = [
  { path: "", component: CustomerListPage, title: "Customers | Counter" },
  {
    path: "new",
    component: CustomerEditorPage,
    title: "New customer | Counter",
  },
  {
    path: ":id/ledger",
    loadComponent: () =>
      import("./pages/customer-ledger/customer-ledger.page").then(
        (m) => m.CustomerLedgerPage,
      ),
    title: "Customer Ledger | Counter",
  },
  {
    path: ":id/payments/new",
    loadComponent: () =>
      import("./pages/customer-payment/customer-payment.page").then(
        (m) => m.CustomerPaymentPage,
      ),
    title: "Take Payment | Counter",
  },
  {
    path: ":id",
    component: CustomerEditorPage,
    title: "Edit customer | Counter",
  },
];
