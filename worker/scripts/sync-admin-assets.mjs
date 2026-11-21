import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "..");
const output = resolve(process.cwd(), "admin-assets");
mkdirSync(output, { recursive: true });
for (const file of ["admin.html", "admin.css", "admin.js", "account.html", "account.css", "account.js", "api-config.js", "login.html", "register.html", "auth-pages.css", "auth-pages.js"]) {
  copyFileSync(resolve(root, file), resolve(output, file));
  process.stdout.write("Synced " + file + "\n");
}
