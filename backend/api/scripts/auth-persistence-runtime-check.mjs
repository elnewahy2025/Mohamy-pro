import pg from 'pg';
import { loadApiLocalEnv } from './load-api-local-env.mjs';

const { Pool } = pg;
loadApiLocalEnv(import.meta.url);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required; the verifier does not print or modify credentials.');
}

function asNumber(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('Database aggregate returned an invalid count.');
  }
  return parsed;
}

function requirePositive(value, label) {
  if (value < 1) throw new Error(`${label} is empty`);
}

function requireTrue(value, label) {
  if (value !== true) throw new Error(`${label} failed`);
}

async function main() {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await pool.query('SELECT 1');
    console.log('auth_persistence_database_status=PASS|read_only=true');

    const identityResult = await pool.query(`
      SELECT
        COUNT(*)::int AS identity_count,
        COUNT(DISTINCT "userId")::int AS mapped_user_count,
        COUNT(*) FILTER (
          WHERE "provider" IS NOT NULL AND length(trim("provider")) > 0
        )::int AS provider_present_count,
        COUNT(*) FILTER (
          WHERE "subject" IS NOT NULL AND length(trim("subject")) > 0
        )::int AS subject_present_count
      FROM "ExternalIdentity"
    `);
    const identity = identityResult.rows[0];
    const identityCount = asNumber(identity.identity_count);
    const mappedUserCount = asNumber(identity.mapped_user_count);
    const providerPresentCount = asNumber(identity.provider_present_count);
    const subjectPresentCount = asNumber(identity.subject_present_count);
    requirePositive(identityCount, 'ExternalIdentity rows');
    requirePositive(mappedUserCount, 'mapped users');
    requireTrue(providerPresentCount === identityCount, 'provider values');
    requireTrue(subjectPresentCount === identityCount, 'subject values');
    console.log(
      `auth_persistence_identity_status=PASS|identity_rows=${identityCount}|mapped_users=${mappedUserCount}|provider_values_present=true|subjects_present=true`,
    );

    const sessionResult = await pool.query(`
      SELECT
        COUNT(*)::int AS session_count,
        COUNT(*) FILTER (WHERE "status" = 'ACTIVE')::int AS active_count,
        COUNT(*) FILTER (WHERE "status" = 'REVOKED')::int AS revoked_count,
        COUNT(*) FILTER (WHERE "status" = 'EXPIRED')::int AS expired_count,
        COUNT(*) FILTER (WHERE length("tokenHash") = 64)::int AS token_hash_valid_count,
        COUNT(*) FILTER (WHERE length("csrfTokenHash") = 64)::int AS csrf_hash_valid_count,
        COUNT(*) FILTER (WHERE "issuedAt" <= "lastUsedAt")::int AS issued_last_used_ordered_count,
        COUNT(*) FILTER (WHERE "issuedAt" < "absoluteExpiresAt")::int AS issued_absolute_ordered_count,
        COUNT(*) FILTER (WHERE "idleExpiresAt" < "absoluteExpiresAt")::int AS idle_absolute_ordered_count,
        COUNT(*) FILTER (
          WHERE "status" = 'ACTIVE'
            AND "csrfTokenCiphertext" IS NOT NULL
            AND "csrfTokenCiphertext" ~ '^v1\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$'
        )::int AS active_csrf_ciphertext_valid_count,
        COUNT(*) FILTER (
          WHERE "status" = 'ACTIVE'
            AND "providerRefreshTokenCiphertext" IS NOT NULL
            AND "providerRefreshTokenCiphertext" ~ '^v1\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$'
        )::int AS active_refresh_ciphertext_valid_count,
        COUNT(*) FILTER (
          WHERE "status" <> 'ACTIVE'
            AND "providerRefreshTokenCiphertext" IS NULL
            AND "csrfTokenCiphertext" IS NULL
        )::int AS inactive_ciphertext_cleared_count,
        COUNT(*) FILTER (
          WHERE "status" = 'ACTIVE' AND "revokedAt" IS NULL
        )::int AS active_revocation_clean_count
      FROM "AppSession"
    `);
    const session = sessionResult.rows[0];
    const sessionCount = asNumber(session.session_count);
    const activeCount = asNumber(session.active_count);
    const revokedCount = asNumber(session.revoked_count);
    const expiredCount = asNumber(session.expired_count);
    const tokenHashValidCount = asNumber(session.token_hash_valid_count);
    const csrfHashValidCount = asNumber(session.csrf_hash_valid_count);
    const issuedLastUsedOrderedCount = asNumber(session.issued_last_used_ordered_count);
    const issuedAbsoluteOrderedCount = asNumber(session.issued_absolute_ordered_count);
    const idleAbsoluteOrderedCount = asNumber(session.idle_absolute_ordered_count);
    const activeCsrfCiphertextValidCount = asNumber(
      session.active_csrf_ciphertext_valid_count,
    );
    const activeRefreshCiphertextValidCount = asNumber(
      session.active_refresh_ciphertext_valid_count,
    );
    const inactiveCiphertextClearedCount = asNumber(
      session.inactive_ciphertext_cleared_count,
    );
    const activeRevocationCleanCount = asNumber(
      session.active_revocation_clean_count,
    );

    requirePositive(sessionCount, 'AppSession rows');
    requireTrue(tokenHashValidCount === sessionCount, 'opaque token hashes');
    requireTrue(csrfHashValidCount === sessionCount, 'CSRF hashes');
    requireTrue(issuedLastUsedOrderedCount === sessionCount, 'issued/last-used ordering');
    requireTrue(issuedAbsoluteOrderedCount === sessionCount, 'issued/absolute ordering');
    requireTrue(idleAbsoluteOrderedCount === sessionCount, 'idle/absolute ordering');
    requireTrue(activeCsrfCiphertextValidCount === activeCount, 'active CSRF ciphertext');
    requireTrue(
      activeRefreshCiphertextValidCount === activeCount,
      'active refresh-token ciphertext',
    );
    requireTrue(
      inactiveCiphertextClearedCount === revokedCount + expiredCount,
      'inactive ciphertext cleanup',
    );
    requireTrue(activeRevocationCleanCount === activeCount, 'active revocation state');

    console.log(
      `auth_persistence_session_status=PASS|sessions=${sessionCount}|active=${activeCount}|revoked=${revokedCount}|expired=${expiredCount}|opaque_hashes=true|expiry_order=true`,
    );
    console.log(
      `auth_persistence_ciphertext_status=PASS|active_refresh_encrypted=true|active_csrf_encrypted=true|inactive_ciphertext_cleared=true`,
    );
    console.log('auth_persistence_runtime_result=PASS');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(
    `auth_persistence_runtime_result=FAIL|error=${error instanceof Error ? error.message : 'unknown error'}`,
  );
  process.exitCode = 1;
});
