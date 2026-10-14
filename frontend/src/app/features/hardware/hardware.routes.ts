import { Routes } from "@angular/router";

export const HARDWARE_ROUTES: Routes = [
  {
    path: "dev/receipt-preview",
    title: "Receipt Preview | Counter",
    loadComponent: () =>
      import("./receipt-preview.page").then((m) => m.ReceiptPreviewPage),
  },
  {
    path: "dev/test-scan",
    title: "Test Scan | Counter",
    loadComponent: () => import("./test-scan.page").then((m) => m.TestScanPage),
  },
];
