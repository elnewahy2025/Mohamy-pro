import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const migrationsDirectory = resolve(process.cwd(), "prisma/migrations");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("Migration check failed: DATABASE_URL is not set.");
  process.exit(1);
}

const entries = await readdir(migrationsDirectory, { withFileTypes: true });
const migrationDirectories = entries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

if (migrationDirectories.length === 0) {
  console.error(`Migration check failed: no migration directories found in ${migrationsDirectory}.`);
  process.exit(1);
}

const repositoryMigrations = new Map();
for (const migrationName of migrationDirectories) {
  const sqlPath = join(migrationsDirectory, migrationName, "migration.sql");
  const sql = await readFile(sqlPath);
  const checksum = createHash("sha256").update(sql).digest("hex");
  repositoryMigrations.set(migrationName, checksum);
}

const client = new Client({ connectionString: databaseUrl });
try {
  await client.connect();
  const result = await client.query(
    'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at, migration_name',
  );

  const appliedMigrations = new Map();
  const incompleteMigrations = [];
  for (const row of result.rows) {
    if (row.rolled_back_at || !row.finished_at) {
      incompleteMigrations.push(row.migration_name);
      continue;
    }
    appliedMigrations.set(row.migration_name, row.checksum);
  }

  const unknownApplied = [...appliedMigrations.keys()].filter(
    (migrationName) => !repositoryMigrations.has(migrationName),
  );
  const checksumMismatches = [...appliedMigrations.entries()]
    .filter(([migrationName, checksum]) => repositoryMigrations.get(migrationName) !== checksum)
    .map(([migrationName, checksum]) => ({
      migrationName,
      databaseChecksum: checksum,
      repositoryChecksum: repositoryMigrations.get(migrationName),
    }));
  const pending = [...repositoryMigrations.keys()].filter(
    (migrationName) => !appliedMigrations.has(migrationName),
  );

  if (unknownApplied.length || checksumMismatches.length || incompleteMigrations.length) {
    console.error("Migration history drift detected.");
    if (unknownApplied.length) {
      console.error(`Applied migrations missing from repository: ${unknownApplied.join(", ")}`);
    }
    if (checksumMismatches.length) {
      for (const mismatch of checksumMismatches) {
        console.error(
          `Checksum mismatch for ${mismatch.migrationName}: database=${mismatch.databaseChecksum} repository=${mismatch.repositoryChecksum}`,
        );
      }
    }
    if (incompleteMigrations.length) {
      console.error(`Incomplete or rolled-back migrations: ${incompleteMigrations.join(", ")}`);
    }
    if (pending.length) {
      console.error(`Pending repository migrations: ${pending.join(", ")}`);
    }
    process.exit(1);
  }

  if (pending.length) {
    console.error(`Migration check found pending migrations: ${pending.join(", ")}`);
    process.exit(1);
  }

  console.log(
    `Migration history is consistent: ${repositoryMigrations.size} repository migration(s), ${appliedMigrations.size} applied migration(s).`,
  );
} catch (error) {
  console.error("Migration check could not inspect the database.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
