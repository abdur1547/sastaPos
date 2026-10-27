import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const tauriConfFile = new URL("src-tauri/tauri.conf.json", root);

export function getAppIdentifier() {
  if (existsSync(tauriConfFile)) {
    try {
      const content = JSON.parse(readFileSync(fileURLToPath(tauriConfFile), "utf8"));
      if (content?.identifier) {
        return content.identifier;
      }
    } catch {
      // fallback to com.sastapos if parse fails
    }
  }
  return "com.sastapos";
}

export function getAppDataDir({
  identifier = getAppIdentifier(),
  platform = process.platform,
  env = process.env,
  home = os.homedir(),
} = {}) {
  const p = platform === "win32" ? path.win32 : path.posix;
  if (platform === "win32") {
    const base = env.APPDATA || p.join(home, "AppData", "Roaming");
    return p.join(base, identifier);
  }
  if (platform === "darwin") {
    return p.join(home, "Library", "Application Support", identifier);
  }
  // Linux and other Unix-like OSes (XDG base directory specification)
  const base = env.XDG_DATA_HOME || p.join(home, ".local", "share");
  return p.join(base, identifier);
}

export function isDbFile(filename, dbFilename = "powersync.db") {
  if (filename.startsWith(dbFilename)) {
    return true;
  }
  return /\.(db|sqlite|sqlite3)(-(wal|shm|journal))?$/i.test(filename);
}

export function cleanDatabase({
  identifier,
  platform,
  env,
  home,
  dbFilename = "powersync.db",
  logger = console,
} = {}) {
  const dir = getAppDataDir({ identifier, platform, env, home });
  logger.log(`Target SQLite app data directory: ${dir}`);

  if (!existsSync(dir)) {
    logger.log("Database directory does not exist. Nothing to clean.");
    return { dir, deleted: [] };
  }

  const entries = readdirSync(dir);
  const dbFiles = entries.filter((file) => isDbFile(file, dbFilename));

  if (dbFiles.length === 0) {
    logger.log(`No SQLite database files found in ${dir}`);
    return { dir, deleted: [] };
  }

  const deleted = [];
  for (const file of dbFiles) {
    const filePath = path.join(dir, file);
    rmSync(filePath, { force: true });
    deleted.push(filePath);
    logger.log(`Deleted: ${filePath}`);
  }

  logger.log(`Successfully deleted ${deleted.length} SQLite database file(s).`);
  return { dir, deleted };
}

const isDirectRun = Boolean(
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
);

if (isDirectRun) {
  try {
    cleanDatabase();
  } catch (err) {
    console.error("Failed to clean database:", err);
    process.exit(1);
  }
}
