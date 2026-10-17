import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

function generate(t, { dotenv, apiBaseUrl } = {}) {
  const root = mkdtempSync(join(tmpdir(), "sastapos-env-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "src/environments"), { recursive: true });
  const script = join(root, "scripts/generate-environment.mjs");
  copyFileSync(new URL("../generate-environment.mjs", import.meta.url), script);
  if (dotenv !== undefined) {
    writeFileSync(join(root, ".env"), dotenv);
  }
  const env = { ...process.env };
  delete env.API_BASE_URL;
  if (apiBaseUrl !== undefined) {
    env.API_BASE_URL = apiBaseUrl;
  }
  const result = spawnSync(process.execPath, [script], {
    env,
    encoding: "utf8",
    cwd: tmpdir(),
  });
  assert.ifError(result.error);
  const output = join(root, "src/environments/environment.generated.ts");
  return { ...result, output };
}

test("loads the frontend .env independent of the working directory and excludes other variables", (t) => {
  const result = generate(t, {
    dotenv:
      '# public configuration\nAPI_BASE_URL="https://api.example.com/"\nSERVER_SECRET=not-for-the-browser\n',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    readFileSync(result.output, "utf8"),
    'export const buildEnvironment = {\n  apiBaseUrl: "https://api.example.com"\n};\n',
  );
});

test("process environment overrides .env", (t) => {
  const result = generate(t, {
    dotenv: "API_BASE_URL=http://localhost:8090",
    apiBaseUrl: "https://production.example.com",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    readFileSync(result.output, "utf8"),
    /https:\/\/production\.example\.com/,
  );
});

test("builds without .env when the process supplies the URL", (t) => {
  const result = generate(t, { apiBaseUrl: "http://localhost:8090" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(result.output, "utf8"), /http:\/\/localhost:8090/);
});

for (const apiBaseUrl of [
  undefined,
  "",
  "not-a-url",
  "ftp://example.com",
  "https://user:password@example.com",
  "https://example.com?key=value",
  "https://example.com#fragment",
]) {
  test(`rejects missing or invalid API_BASE_URL: ${JSON.stringify(apiBaseUrl)}`, (t) => {
    const result = generate(t, { apiBaseUrl });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /API_BASE_URL|Invalid URL/);
    assert.equal(existsSync(result.output), false);
  });
}
