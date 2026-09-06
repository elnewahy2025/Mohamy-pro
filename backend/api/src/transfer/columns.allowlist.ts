/**
 * Export column allowlists per entity. Anything not listed here never
 * leaves the system: tokens, hashes, secrets, and internal flags are
 * absent by construction (fail-closed).
 */
export const EXPORT_COLUMNS: Record<string, readonly string[]> = {
  CASE: [
    'id',
    'caseNumber',
    'internalNumber',
    'status',
    'priority',
    'openDate',
    'closeDate',
    'createdAt',
  ],
  CLIENT: [
    'id',
    'displayName',
    'legalName',
    'clientType',
    'status',
    'createdAt',
  ],
  PARTY: ['id', 'displayName', 'partyType', 'status', 'createdAt'],
  TASK: [
    'id',
    'title',
    'description',
    'status',
    'priority',
    'dueDate',
    'createdAt',
  ],
};

export const IMPORT_REQUIRED_COLUMNS: Record<string, readonly string[]> = {
  CASE: ['caseNumber', 'clientId'],
  CLIENT: ['displayName'],
  PARTY: ['displayName', 'partyType'],
  TASK: ['title'],
};

export const MAX_IMPORT_ROWS = 1000;
export const MAX_INLINE_BYTES = 256 * 1024;
export const MAX_EXPORT_ROWS = 5000;
