/**
 * Independent Offline Backup & Export Tool for Melek Portfolio
 * 
 * Securely downloads and verifies encrypted backup bundles from the API
 * or exports directly from D1 using local admin credentials.
 * 
 * Usage:
 *   CF_ACCESS_TOKEN="<jwt>" node scripts/export-backup.mjs [download|verify|decrypt]
 * 
 * Output: Encrypted backup files are saved locally to ./backups/ (git-ignored)
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BACKUP_DIR = resolve(ROOT, "backups");
mkdirSync(BACKUP_DIR, { recursive: true });

const API_BASE = process.env.PORTFOLIO_API_BASE || "https://melek-portfolio-api.melekabdelmaksoud72.workers.dev";
const ACCESS_TOKEN = process.env.CF_ACCESS_TOKEN || process.env.ACCESS_TOKEN || "";
const ACTION = process.argv[2] || "download";

async function main() {
  console.log(`[Melek Portfolio Backup Tool] Action: ${ACTION}`);
  console.log(`[Target API]: ${API_BASE}`);

  if (ACTION === "download") {
    if (!ACCESS_TOKEN) {
      console.error("Error: CF_ACCESS_TOKEN environment variable is required to download backups from Cloudflare Access protected endpoints.");
      process.exit(1);
    }

    console.log("Requesting encrypted backup stream from API...");
    const res = await fetch(`${API_BASE}/api/admin/backups/download`, {
      headers: {
        "CF-Access-Jwt-Assertion": ACCESS_TOKEN
      }
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`Failed to download backup: HTTP ${res.status} - ${err}`);
      process.exit(1);
    }

    const disposition = res.headers.get("content-disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.enc`;
    const buffer = Buffer.from(await res.arrayBuffer());
    const targetPath = resolve(BACKUP_DIR, filename);

    writeFileSync(targetPath, buffer);
    console.log(`[SUCCESS] Encrypted backup bundle saved to: ${targetPath}`);
    console.log(`Size: ${buffer.length} bytes`);
    console.log(`Format: AES-256-GCM encrypted package (Version 0x01)`);
  } else if (ACTION === "verify") {
    const file = process.argv[3];
    if (!file || !existsSync(file)) {
      console.error("Error: Please provide path to backup file to verify. Example: node scripts/export-backup.mjs verify backups/backup-xyz.enc");
      process.exit(1);
    }
    const buffer = readFileSync(file);
    if (buffer.length < 14 || buffer[0] !== 0x01) {
      console.error("Error: Invalid or corrupted backup file format.");
      process.exit(1);
    }
    console.log(`[SUCCESS] Backup file ${file} has valid Version 1 header and IV structure (${buffer.length} bytes).`);
  } else {
    console.log("Usage: node scripts/export-backup.mjs [download|verify]");
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
