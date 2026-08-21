export function classifyMigrationRows(rows) {
  const rowsByMigration = new Map();

  for (const row of rows) {
    const migrationRows = rowsByMigration.get(row.migration_name) ?? [];
    migrationRows.push(row);
    rowsByMigration.set(row.migration_name, migrationRows);
  }

  const appliedMigrations = new Map();
  const incompleteMigrations = [];
  const checksumConflicts = [];
  const supersededAttempts = [];

  for (const [migrationName, migrationRows] of rowsByMigration) {
    const successfulRows = migrationRows.filter(
      (row) => row.finished_at && !row.rolled_back_at,
    );
    const latestRow = migrationRows.at(-1);

    if (successfulRows.length > 0) {
      const successfulChecksums = [
        ...new Set(successfulRows.map((row) => row.checksum)),
      ];

      if (successfulChecksums.length > 1) {
        checksumConflicts.push({ migrationName, checksums: successfulChecksums });
      }

      if (latestRow.finished_at && !latestRow.rolled_back_at) {
        appliedMigrations.set(migrationName, latestRow.checksum);
      } else {
        incompleteMigrations.push(migrationName);
      }

      if (migrationRows.some((row) => row.rolled_back_at || !row.finished_at)) {
        supersededAttempts.push(migrationName);
      }
      continue;
    }

    incompleteMigrations.push(migrationName);
  }

  return {
    appliedMigrations,
    checksumConflicts,
    incompleteMigrations,
    supersededAttempts,
  };
}
