# mock-fbr-api

> Historical mock only: this implements the obsolete 2023 contract, **not current FBR DI v1.12**. The [integration design](../docs/fbr-integration-plan.md) now has the Spring backend alone call remote FBR with backend-only credentials. Replace submit/validate/reference fixtures and add item failures, ambiguous delivery, environment and multi-worker/idempotent-command checks before validating that design. Do not use real FBR credentials or customer data here.

Dev-only mock of the FBR Digital Invoicing `PostInvoiceData_v1` API (see `docs/Technical-Specification-Digital-Invoicing.txt` §2.3–2.6). It **validates nothing**: every POST returns a success response with a freshly generated tracking number. Do not use outside development.

## Run

```shell
npm install
npm run dev   # http://127.0.0.1:8244 (override with PORT)
npm test
```

## Endpoints

`POST /DigitalInvoicing/v1/PostInvoiceData_v1` and `POST /pdi/v1/api/DigitalInvoicing/PostInvoiceData_v1` (the documented sandbox/production paths). Authorization headers and bodies are accepted as-is and the body is logged.

Response (HTTP 200), matching spec §2.6:

```json
{
  "$id": "1",
  "version": "1.0",
  "statusCode": 200,
  "errorMessage": "",
  "result": "900005CLNP5914173522",
  "timestamp": "2023-12-20T16:59:15.4831026+05:00",
  "errors": { "$id": "2", "$values": [] }
}
```

These paths and port are historical development fixtures, not evidence of an installed FBR service. Current DI uses the official remote sandbox/production endpoints documented in the [integration plan](../docs/fbr-integration-plan.md#32-current-contract-and-exact-endpoints).
