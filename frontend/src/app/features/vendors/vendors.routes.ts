import { Routes } from "@angular/router";

import { VendorListPage } from "./pages/vendor-list/vendor-list.page";
import { VendorEditorPage } from "./pages/vendor-editor/vendor-editor.page";
import { VendorLedgerPage } from "./pages/vendor-ledger/vendor-ledger.page";
import { VendorPaymentPage } from "./pages/vendor-payment/vendor-payment.page";

export const VENDOR_ROUTES: Routes = [
  {
    path: "",
    component: VendorListPage,
    title: "Vendors | Counter",
  },
  {
    path: "new",
    component: VendorEditorPage,
    title: "New Vendor | Counter",
  },
  {
    path: ":id/ledger",
    component: VendorLedgerPage,
    title: "Vendor Ledger | Counter",
  },
  {
    path: ":id/payments/new",
    component: VendorPaymentPage,
    title: "Record Vendor Settlement | Counter",
  },
  {
    path: ":id",
    component: VendorEditorPage,
    title: "Edit Vendor | Counter",
  },
];

