import { copyFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "../..");
const output = resolve(scriptDir, "../admin-assets");
mkdirSync(output, { recursive: true });
for (const file of ["admin.html", "admin.css", "admin.js", "account.html", "account.css", "account.js", "api-config.js", "login.html", "register.html", "auth-pages.css", "auth-pages.js"]) {
  copyFileSync(resolve(root, file), resolve(output, file));
  process.stdout.write("Synced " + file + "\n");
}
