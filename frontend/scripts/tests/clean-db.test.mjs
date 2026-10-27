import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  cleanDatabase,
  getAppDataDir,
  getAppIdentifier,
  isDbFile,
} from "../clean-db.mjs";

test("getAppIdentifier returns identifier configured in tauri.conf.json", () => {
  const id = getAppIdentifier();
  assert.equal(id, "com.sastapos");
});

test("getAppDataDir resolves correctly for win32", () => {
  const home = "/Users/testuser";
  const identifier = "com.test.app";

  const withEnv = getAppDataDir({
    identifier,
    platform: "win32",
    env: { APPDATA: "C:\\AppData\\Roaming" },
    home,
  });
  assert.equal(withEnv, "C:\\AppData\\Roaming" + path.win32.sep + identifier);

  const fallback = getAppDataDir({
    identifier,
    platform: "win32",
    env: {},
    home: "C:\\Users\\testuser",
  });
  assert.equal(
    fallback,
    "C:\\Users\\testuser" + path.win32.sep + "AppData" + path.win32.sep + "Roaming" + path.win32.sep + identifier,
  );
});

test("getAppDataDir resolves correctly for darwin (macOS)", () => {
  const home = "/Users/testuser";
  const identifier = "com.test.app";

  const result = getAppDataDir({
    identifier,
    platform: "darwin",
    env: {},
    home,
  });
  assert.equal(
    result,
    path.posix.join(home, "Library", "Application Support", identifier),
  );
});

test("getAppDataDir resolves correctly for linux", () => {
  const home = "/home/testuser";
  const identifier = "com.test.app";

  const defaultPath = getAppDataDir({
    identifier,
    platform: "linux",
    env: {},
    home,
  });
  assert.equal(
    defaultPath,
    path.posix.join(home, ".local", "share", identifier),
  );

  const customXdg = getAppDataDir({
    identifier,
    platform: "linux",
    env: { XDG_DATA_HOME: "/custom/share" },
    home,
  });
  assert.equal(customXdg, path.posix.join("/custom/share", identifier));
});

test("isDbFile recognizes powersync and sqlite files and ignores others", () => {
  assert.equal(isDbFile("powersync.db"), true);
  assert.equal(isDbFile("powersync.db-wal"), true);
  assert.equal(isDbFile("powersync.db-shm"), true);
  assert.equal(isDbFile("powersync.db-journal"), true);
  assert.equal(isDbFile("receipts.sqlite"), true);
  assert.equal(isDbFile("receipts.sqlite-wal"), true);
  assert.equal(isDbFile("custom.db"), true);

  assert.equal(isDbFile("config.json"), false);
  assert.equal(isDbFile("receipts.sqlite.bak"), false);
  assert.equal(isDbFile("state.txt"), false);
});

test("cleanDatabase deletes only database files and retains other files", (t) => {
  const tempBase = mkdtempSync(path.join(tmpdir(), "sastapos-db-test-"));
  t.after(() => rmSync(tempBase, { recursive: true, force: true }));

  const identifier = "com.sastapos";
  const appDataDir = path.join(tempBase, identifier);
  mkdirSync(appDataDir, { recursive: true });

  const dbFile = path.join(appDataDir, "powersync.db");
  const walFile = path.join(appDataDir, "powersync.db-wal");
  const shmFile = path.join(appDataDir, "powersync.db-shm");
  const nonDbFile = path.join(appDataDir, "important-config.json");

  writeFileSync(dbFile, "sqlite db content");
  writeFileSync(walFile, "wal content");
  writeFileSync(shmFile, "shm content");
  writeFileSync(nonDbFile, '{"setting": true}');

  const silentLogger = { log: () => {} };
  const result = cleanDatabase({
    identifier,
    platform: "linux",
    env: { XDG_DATA_HOME: tempBase },
    logger: silentLogger,
  });

  assert.equal(result.deleted.length, 3);
  assert.equal(existsSync(dbFile), false);
  assert.equal(existsSync(walFile), false);
  assert.equal(existsSync(shmFile), false);
  assert.equal(existsSync(nonDbFile), true);
  assert.deepEqual(readdirSync(appDataDir), ["important-config.json"]);
});

test("cleanDatabase handles non-existent directory gracefully", () => {
  const silentLogger = { log: () => {} };
  const result = cleanDatabase({
    identifier: "com.nonexistent.app",
    platform: "linux",
    env: { XDG_DATA_HOME: "/nonexistent-path-12345" },
    logger: silentLogger,
  });

  assert.deepEqual(result.deleted, []);
});

test("clean-db CLI execution runs cleanly via child process", (t) => {
  const tempBase = mkdtempSync(path.join(tmpdir(), "sastapos-cli-test-"));
  t.after(() => rmSync(tempBase, { recursive: true, force: true }));

  const appDataDir = path.join(tempBase, "com.sastapos");
  mkdirSync(appDataDir, { recursive: true });
  writeFileSync(path.join(appDataDir, "powersync.db"), "data");

  const scriptPath = fileURLToPath(new URL("../clean-db.mjs", import.meta.url));
  const res = spawnSync(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      XDG_DATA_HOME: tempBase,
    },
    encoding: "utf8",
  });

  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /Deleted: .*powersync\.db/);
  assert.equal(existsSync(path.join(appDataDir, "powersync.db")), false);
});

