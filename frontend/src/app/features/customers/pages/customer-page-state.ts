import { ActivatedRoute } from "@angular/router";
import { catchError, defer, map, of, startWith, switchMap } from "rxjs";

import { Customer } from "../customer.model";
import { CustomerService } from "../customer.service";

export type CustomerPageState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly customer: Customer }
  | { readonly status: "error"; readonly message: string };

export function watchCustomerPage(
  route: ActivatedRoute,
  customers: CustomerService,
) {
  return route.paramMap.pipe(
    switchMap((params) =>
      defer(() => customers.watchById(params.get("id") ?? "")).pipe(
        map((customer): CustomerPageState =>
          customer
            ? { status: "ready", customer }
            : {
                status: "error",
                message: "This customer no longer exists in the current store.",
              },
        ),
        catchError((error: unknown) =>
          of<CustomerPageState>({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Could not load this customer.",
          }),
        ),
        startWith<CustomerPageState>({ status: "loading" }),
      ),
    ),
  );
}
