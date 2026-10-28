/*
 * Writes a consistent copy of the database to a file you can carry away.
 * Safe to run while the shop is open: SQLite's own backup API is used rather
 * than copying the file, which would catch it mid-write.
 *
 *   node backup.mjs                  -> backups/kitchen-stock-<date>.db
 *   node backup.mjs /mnt/usb/kw.db   -> exactly there
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(HERE, "data");
const source = path.join(DATA_DIR, "kitchen-stock.db");
if (!fs.existsSync(source)) {
  console.error(`No database at ${source} — nothing to back up yet.`);
  process.exit(1);
}
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
let target = process.argv[2] || path.join(HERE, "backups", `kitchen-stock-${stamp}.db`);
fs.mkdirSync(path.dirname(target), { recursive: true });

const db = new Database(source, { readonly: true });
await db.backup(target);
db.close();
console.log(`${target}  (${(fs.statSync(target).size / 1024).toFixed(0)} KB)`);
