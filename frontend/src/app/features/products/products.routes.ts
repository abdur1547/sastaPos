import { Routes } from "@angular/router";

import { ProductEditorPage } from "./pages/product-editor/product-editor.page";
import { ProductListPage } from "./pages/product-list/product-list.page";

export const PRODUCT_ROUTES: Routes = [
  { path: "", component: ProductListPage, title: "Products | Counter" },
  { path: "new", component: ProductEditorPage, title: "New product | Counter" },
  { path: ":id", component: ProductEditorPage, title: "Edit product | Counter" },
];
