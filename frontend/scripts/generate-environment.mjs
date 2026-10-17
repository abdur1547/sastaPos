import { existsSync, writeFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const envFile = new URL(".env", root);

if (existsSync(envFile)) {
  loadEnvFile(fileURLToPath(envFile));
}

const apiBaseUrl = process.env.API_BASE_URL;

if (!apiBaseUrl) {
  throw new Error(
    "API_BASE_URL is required. Set it in frontend/.env or the build environment.",
  );
}

const url = new URL(apiBaseUrl);
if (
  !["http:", "https:"].includes(url.protocol) ||
  url.username ||
  url.password ||
  url.search ||
  url.hash
) {
  throw new Error(
    "API_BASE_URL must be an HTTP(S) URL without credentials, a query, or a fragment.",
  );
}

writeFileSync(
  new URL("src/environments/environment.generated.ts", root),
  `export const buildEnvironment = {\n  apiBaseUrl: ${JSON.stringify(apiBaseUrl.replace(/\/+$/, ""))}\n};\n`,
);
console.log("Generated Angular build environment.");
