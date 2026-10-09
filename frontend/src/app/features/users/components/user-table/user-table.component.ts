import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { DatePipe } from "@angular/common";
import { MatProgressBarModule } from "@angular/material/progress-bar";

import { UserListItem } from "../../user-query.model";

@Component({
  selector: "app-user-table",
  imports: [DatePipe, MatProgressBarModule],
  templateUrl: "./user-table.component.html",
  styleUrl: "./user-table.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserTableComponent {
  readonly users = input<readonly UserListItem[]>([]);
  readonly loading = input(false);
  readonly selectUser = output<UserListItem>();

  protected roleLabel(user: UserListItem): string {
    return user.role === "OWNER" ? "Owner" : user.role === "CASHIER" ? "Cashier" : "Admin";
  }
}
