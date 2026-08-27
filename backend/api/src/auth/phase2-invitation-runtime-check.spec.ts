import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 2 invitation runtime fixture SQL contract', () => {
  it('uses only columns present on MembershipRole', () => {
    const verifierPath = resolve(
      __dirname,
      '../../scripts/phase2-invitation-runtime-check.mjs',
    );
    const verifierSource = readFileSync(verifierPath, 'utf8');
    const statement = verifierSource.match(
      /INSERT INTO "MembershipRole" \(([^)]+)\) VALUES \(([^)]+)\)/,
    );

    if (!statement) {
      throw new Error('MembershipRole fixture insert was not found');
    }

    const columns = statement[1].split(',').map((column) => column.trim());
    const values = statement[2].split(',').map((value) => value.trim());

    expect(columns).toEqual([
      '"id"',
      '"tenantId"',
      '"membershipId"',
      '"roleId"',
      '"assignedAt"',
    ]);
    expect(columns).not.toContain('"createdAt"');
    expect(values).toHaveLength(columns.length);
  });

  it('uses an allowlisted invitation-create response-code diagnostic', () => {
    const verifierPath = resolve(
      __dirname,
      '../../scripts/phase2-invitation-runtime-check.mjs',
    );
    const verifierSource = readFileSync(verifierPath, 'utf8');

    expect(verifierSource).toContain(
      'const SAFE_INVITATION_CREATE_ERROR_CODES = new Set([',
    );
    for (const code of [
      'MFA_STEP_UP_REQUIRED',
      'AUTHORIZATION_DENIED',
      'FORBIDDEN',
    ]) {
      expect(verifierSource).toContain(`'${code}'`);
    }
    expect(verifierSource).toContain(": 'UNKNOWN'");
    expect(verifierSource).toContain(
      'INVITATION_CREATE_HTTP_403_CODE_${safeApiErrorCode(created.payload)}',
    );
  });

  it('normalizes a pending admin for switching and restores original user statuses', () => {
    const verifierPath = resolve(
      __dirname,
      '../../scripts/phase2-invitation-runtime-check.mjs',
    );
    const verifierSource = readFileSync(verifierPath, 'utf8');

    expect(verifierSource).toContain("currentSubstage = 'admin_user_activate'");
    expect(verifierSource).toContain(
      String.raw`UPDATE "User" SET "status" = \'ACTIVE\' WHERE "id" = $1 AND "status" = \'PENDING\'`,
    );
    expect(verifierSource).toContain(
      'async function restoreOriginalUserStatuses',
    );
    expect(verifierSource).toContain(
      'for (const [userId, status] of fixture.originalUserStatuses)',
    );
    expect(verifierSource).toContain("currentStage = 'cleanup_user_status'");
  });

  it('asserts accepted membership through the restricted RLS transaction', () => {
    const verifierPath = resolve(
      __dirname,
      '../../scripts/phase2-invitation-runtime-check.mjs',
    );
    const verifierSource = readFileSync(verifierPath, 'utf8');

    expect(verifierSource).toContain(
      'async function assertAcceptedMembershipVisible',
    );
    expect(verifierSource).toContain("await runtime.query('BEGIN')");
    expect(verifierSource).toContain('await bindRuntimeTenantContext(');
    expect(verifierSource).toContain('AND m."id" = $3`');
    expect(verifierSource).toContain('[tenantId, userId, membershipId]');
    expect(verifierSource).toContain("await runtime.query('COMMIT')");
    expect(verifierSource).toContain("await runtime.query('ROLLBACK')");
  });
});

export {};
