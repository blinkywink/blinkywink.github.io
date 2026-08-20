/**
 * Preview or execute a full account progress wipe (keeps logins + Early Supporter badges).
 *
 *   npm run reset-accounts -- --dry-run
 *   npm run reset-accounts -- --execute
 *
 * Requires supabase/reset_all_accounts.sql installed on the DB first.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const CONFIRM = "RESET_ALL_ACCOUNTS";
const SQL_PATH = resolve("supabase/reset_all_accounts.sql");

function loadDbUrl(): string {
  const envPath = resolve(".env.local");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^SUPABASE_DB_URL=(.+)$/);
      if (m) return m[1]!.trim();
    }
  }
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    throw new Error("SUPABASE_DB_URL missing (.env.local or env)");
  }
  return url;
}

async function ensureFunctions(client: pg.Client): Promise<void> {
  const sql = readFileSync(SQL_PATH, "utf8");
  await client.query(sql);
}

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  const dryRun = process.argv.includes("--dry-run") || !execute;

  if (execute && process.argv.includes("--dry-run")) {
    throw new Error("Use either --dry-run or --execute, not both");
  }

  const client = new pg.Client({
    connectionString: loadDbUrl(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    console.log("Installing/updating reset functions…");
    await ensureFunctions(client);

    if (dryRun) {
      console.log("\n=== DRY RUN (no changes) ===\n");
      const { rows } = await client.query(
        "select public.preview_reset_all_accounts() as preview",
      );
      console.log(JSON.stringify(rows[0]?.preview, null, 2));
      console.log(
        "\nTo execute later: npm run reset-accounts -- --execute",
      );
      return;
    }

    console.log("\n=== EXECUTING FULL ACCOUNT RESET ===");
    console.log(`Confirmation token: ${CONFIRM}\n`);
    const { rows } = await client.query(
      "select public.reset_all_accounts_to_fresh($1) as result",
      [CONFIRM],
    );
    console.log(JSON.stringify(rows[0]?.result, null, 2));
    console.log("\nDone.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
