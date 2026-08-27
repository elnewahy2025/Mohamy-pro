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
      'INVITATION_CREATE_HTTP_403_CODE_${safeApiErrorCode(created.payload, SAFE_INVITATION_CREATE_ERROR_CODES)}',
    );
  });

  it('uses an allowlisted expired-acceptance response-code diagnostic', () => {
    const verifierPath = resolve(
      __dirname,
      '../../scripts/phase2-invitation-runtime-check.mjs',
    );
    const verifierSource = readFileSync(verifierPath, 'utf8');

    expect(verifierSource).toContain(
      'const SAFE_INVITATION_ACCEPT_ERROR_CODES = new Set([',
    );
    for (const code of [
      'INVITATION_NOT_ACTIONABLE',
      'INVITATION_INVALID',
      'FORBIDDEN',
      'INTERNAL_SERVER_ERROR',
    ]) {
      expect(verifierSource).toContain(`'${code}'`);
    }
    expect(verifierSource).toContain(
      'INVITATION_EXPIRE_ACCEPT_HTTP_${expireAccept.response.status}_CODE_${safeApiErrorCode(expireAccept.payload, SAFE_INVITATION_ACCEPT_ERROR_CODES)}',
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

  it('covers persisted inviter authority revocation without mutating the pending invitation', () => {
    const verifierPath = resolve(
      __dirname,
      '../../scripts/phase2-invitation-runtime-check.mjs',
    );
    const verifierSource = readFileSync(verifierPath, 'utf8');

    expect(verifierSource).toContain(
      'async function setInviterAuthorityRevoked',
    );
    expect(verifierSource).toContain(
      'invitation_inviter_authority_status=PASS|http=400|state_unchanged=true|authority_revalidation=true',
    );
    expect(verifierSource).toContain(
      'INVITATION_INVITER_AUTHORITY_ERROR_CODE_INVALID',
    );
    expect(verifierSource).toContain(
      "await assertInvitationVisible(\n        runtime,\n        fixture.tenantId,\n        adminUser.session.user.id,\n        fixture.membershipId,\n        authorityRevocationData.invitationId,\n        'PENDING',\n      );",
    );
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
