import assert from "node:assert/strict";
import { once } from "node:events";
import { AddressInfo } from "node:net";
import { test } from "node:test";

import { createApp, INVOICE_PATHS } from "./app.js";

test("returns the documented success envelope for any body on every documented path", async () => {
  const server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;

  try {
    for (const path of INVOICE_PATHS) {
      const reply = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anything: "goes" }),
      });
      const body = (await reply.json()) as Record<string, unknown>;

      assert.equal(reply.status, 200);
      assert.equal(body.$id, "1");
      assert.equal(body.version, "1.0");
      assert.equal(body.statusCode, 200);
      assert.equal(body.errorMessage, "");
      assert.match(String(body.result), /^\d{6}[A-Z]{4}\d{10}$/);
      assert.match(String(body.timestamp), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{7}\+05:00$/);
      assert.deepEqual(body.errors, { $id: "2", $values: [] });
    }
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
