import test from "node:test";
import assert from "node:assert/strict";
import { classifyMigrationRows } from "./migration-checker-core.mjs";

const row = (migration_name, checksum, started_at, finished_at, rolled_back_at = null) => ({
  migration_name,
  checksum,
  started_at,
  finished_at,
  rolled_back_at,
});

test("accepts one successful migration row", () => {
  const result = classifyMigrationRows([
    row("20260821000000_repair_baseline_indexes", "repair-checksum", "2026-08-21T10:00:00Z", "2026-08-21T10:00:01Z"),
  ]);

  assert.deepEqual([...result.appliedMigrations], [
    ["20260821000000_repair_baseline_indexes", "repair-checksum"],
  ]);
  assert.deepEqual(result.incompleteMigrations, []);
  assert.deepEqual(result.checksumConflicts, []);
});

test("accepts a successful row after a rolled-back attempt and reports the retained attempt", () => {
  const result = classifyMigrationRows([
    row("00000000000000_init", "init-checksum", "2026-08-21T10:00:00Z", null, "2026-08-21T10:00:01Z"),
    row("00000000000000_init", "init-checksum", "2026-08-21T10:01:00Z", "2026-08-21T10:01:01Z"),
  ]);

  assert.deepEqual([...result.appliedMigrations], [["00000000000000_init", "init-checksum"]]);
  assert.deepEqual(result.incompleteMigrations, []);
  assert.deepEqual(result.supersededAttempts, ["00000000000000_init"]);
});

test("rejects a latest rolled-back attempt even when an earlier attempt succeeded", () => {
  const result = classifyMigrationRows([
    row("20260820190000_outbox_delivery_semantics", "outbox-checksum", "2026-08-21T10:00:00Z", "2026-08-21T10:00:01Z"),
    row("20260820190000_outbox_delivery_semantics", "outbox-checksum", "2026-08-21T10:01:00Z", null, "2026-08-21T10:01:01Z"),
  ]);

  assert.deepEqual([...result.appliedMigrations], []);
  assert.deepEqual(result.incompleteMigrations, ["20260820190000_outbox_delivery_semantics"]);
});

test("rejects an unresolved first attempt", () => {
  const result = classifyMigrationRows([
    row("20260821000000_repair_baseline_indexes", "repair-checksum", "2026-08-21T10:00:00Z", null),
  ]);

  assert.deepEqual(result.incompleteMigrations, ["20260821000000_repair_baseline_indexes"]);
  assert.deepEqual([...result.appliedMigrations], []);
});

test("detects multiple successful checksums for the same migration", () => {
  const result = classifyMigrationRows([
    row("20260821000000_repair_baseline_indexes", "old-checksum", "2026-08-21T10:00:00Z", "2026-08-21T10:00:01Z"),
    row("20260821000000_repair_baseline_indexes", "new-checksum", "2026-08-21T10:01:00Z", "2026-08-21T10:01:01Z"),
  ]);

  assert.deepEqual(result.incompleteMigrations, []);
  assert.deepEqual(result.checksumConflicts, [
    {
      migrationName: "20260821000000_repair_baseline_indexes",
      checksums: ["old-checksum", "new-checksum"],
    },
  ]);
});
