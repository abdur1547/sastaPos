import { Routes } from "@angular/router";

import { UserEditorPage } from "./pages/user-editor/user-editor.page";
import { UserListPage } from "./pages/user-list/user-list.page";

export const USER_ROUTES: Routes = [
  { path: "", component: UserListPage, title: "Staff | Counter" },
  { path: "new", component: UserEditorPage, title: "New staff member | Counter" },
  { path: ":id", component: UserEditorPage, title: "Edit staff member | Counter" },
];
