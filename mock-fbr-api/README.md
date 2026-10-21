# mock-fbr-api

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

The real Windows local-service host, port and path are not documented (plan milestone M1), so these paths and port are placeholders for development.
