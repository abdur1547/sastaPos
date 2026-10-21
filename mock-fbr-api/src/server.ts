import { createApp, INVOICE_PATHS } from "./app.js";

const port = Number(process.env.PORT ?? 8244);

createApp().listen(port, "127.0.0.1", () => {
  console.log(`[mock-fbr] listening on http://127.0.0.1:${port}`);
  for (const path of INVOICE_PATHS) {
    console.log(`[mock-fbr] POST ${path}`);
  }
});
