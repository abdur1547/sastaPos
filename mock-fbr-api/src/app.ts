import express, { Express } from "express";

import { buildSuccessResponse } from "./response.js";

/** Sandbox and production paths from the specification; the local Windows service path is not documented. */
export const INVOICE_PATHS = [
  "/DigitalInvoicing/v1/PostInvoiceData_v1",
  "/pdi/v1/api/DigitalInvoicing/PostInvoiceData_v1",
] as const;

/** Dev-only: accepts any body and returns the documented success response. Intentionally validates nothing. */
export function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: "5mb" }));

  app.post([...INVOICE_PATHS], (request, response) => {
    console.log(`[mock-fbr] ${request.method} ${request.path}`);
    console.log(JSON.stringify(request.body));
    response.status(200).json(buildSuccessResponse());
  });

  return app;
}
