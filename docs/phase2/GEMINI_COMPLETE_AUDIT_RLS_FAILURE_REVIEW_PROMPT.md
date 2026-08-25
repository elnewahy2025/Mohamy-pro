# Gemini Prompt: Complete Mohamy Pro Phase 2 AuditEvent/RLS Failure Review

## Role and review boundary

You are reviewing a Phase 2 PostgreSQL/RLS failure for the Mohamy Pro repository. You cannot access the GitHub repository, Windows workstation, Docker Desktop, database, environment files, credentials, passwords, tokens, cookies, authorization codes, or raw logs. Review only the technical facts and source excerpts included below.

Do not request or infer any secret. Do not recommend resetting or recreating the database, deleting a Docker volume, weakening RLS, enabling `BYPASSRLS`, making the application role a table owner, granting `ALL`, adding credentials to migrations, changing passwords, editing migration history, or using an untracked diagnostic write. Any proposed database or protected-configuration action must be explicitly labeled as **user-run only** and must contain no password value.

The objective is to identify and correct the exact cause of PostgreSQL SQLSTATE `42501` during the real OIDC session-creation path under the restricted runtime role. Do not accept a workaround that merely bypasses the failure or invalidates the RLS test.

## Project constraints

The work is Phase 2 only. Phase 3 has not started. Production readiness is not established. Existing Windows PostgreSQL data must be preserved. The runtime role must remain non-owner, `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`, and `NOREPLICATION`. Prisma CLI migrations use a protected administrative connection; API and worker runtime use a separate restricted connection. The application must continue to use transaction-local RLS context, forced RLS, append-only audit behavior, and explicit least-privilege grants.

The repository uses NestJS 11, Prisma 7.9.1, the `PrismaPg` PostgreSQL adapter, PostgreSQL 16.15 in Docker Desktop, Redis/BullMQ, and Keycloak. The Windows development ports are PostgreSQL `55432`, Redis `56379`, Keycloak `58080`, and API `3000`. These ports are included only as non-secret topology facts; no URL containing credentials is provided.

## Complete relevant sanitized runtime evidence

The following is the complete relevant bounded evidence. Request identifiers, callback URLs, authorization codes, state values, session values, cookies, headers, and raw request metadata were intentionally removed.

### Historical invalid-RLS evidence under the original runtime role

Before the least-privilege cutover, the runtime role was diagnosed as a PostgreSQL superuser with RLS bypass:

```text
audit_rls_role_diagnostic=superuser=true|bypassrls=true|enabled=true|forced=true
```

Under that role, the reliability verifier produced a bounded diagnostic showing both fixture tenants visible:

```text
audit_rls_diagnostic=same_tenant_visible|cross_tenant_visible
```

This evidence is invalid for judging RLS policy correctness because PostgreSQL superusers and roles with `BYPASSRLS` bypass row security. It is retained only to explain why the original RLS campaign was stopped.

The same historical run proved these non-RLS source/reliability slices and cleanup behavior, but they were not accepted as restricted-role RLS evidence:

```text
audit_outbox_source_status=PASS|http=200|server_derived_context=true
audit_outbox_delivery_status=PASS|status=PROCESSED|attempts=1
audit_outbox_duplicate_status=PASS|job_states=completed,completed|attempts_unchanged=true|audit_count=1
phase2_reliability_cleanup_status=PASS|audit_residue=0|outbox_residue=0|active_fixture_tenants=0|active_fixture_memberships=0|active_fixture_contexts=0
phase2_reliability_runtime_result=FAIL|stage=audit_rls_boundary|error_class=Error
```

### Least-privilege role evidence

After user-run out-of-band provisioning and protected runtime configuration, the restricted runtime role passed the prerequisite:

```text
audit_rls_role_diagnostic=superuser=false|bypassrls=false|enabled=true|forced=true
```

The bounded network check also passed:

```text
PORT_PRECHECK=api=True|keycloak=True|postgres=True|redis=True
OIDC_TRANSPORT_PRECHECK=api_http=302|api_location=true|keycloak_http=200|keycloak_login_form=true
```

The API and worker started successfully with database and Redis connections. Prisma CLI reported no pending migrations and used the administrative migration connection. No data reset or migration-history change occurred.

### Current failure evidence under the restricted role

The reliability verifier now stops at authenticated fixture creation:

```text
audit_authenticated_fixture_diagnostic=substage=login|login_stage=callback_request|error_class=OidcLoginStageError|cause_class=Error
phase2_reliability_runtime_result=FAIL|stage=authenticated_fixture|error_class=OidcLoginStageError
```

The API emitted this sanitized warning prefix during the real callback path:

```text
OIDC callback rejected during session_creation|error=PrismaClientKnownRequestError|db_code=P2039|db_model=AuditEvent|driver_code=42501|driver_kind=none|driver_category=insufficient_privilege
```

The complete relevant error facts are therefore:

- The restricted role is not a superuser and does not have `BYPASSRLS`.
- `AuditEvent` RLS is enabled and forced.
- API and Keycloak transport succeeds.
- OIDC login reaches the callback.
- The failure occurs during session creation.
- Prisma reports `P2039` for model `AuditEvent`.
- Prisma’s wrapped PostgreSQL driver code is SQLSTATE `42501` (`insufficient_privilege`).
- The failure is on the real `AuditEvent` write, not on a synthetic diagnostic row.

## Applied AuditEvent schema and RLS context

The applied migration is:

```text
backend/api/prisma/migrations/20260823160000_phase2_audit_event_foundation/migration.sql
```

The table has these relevant columns and constraints:

```sql
CREATE TABLE IF NOT EXISTS "AuditEvent" (
  "id" TEXT NOT NULL,
  "eventType" VARCHAR(128) NOT NULL,
  "eventVersion" INTEGER NOT NULL DEFAULT 1,
  "category" "AuditCategory" NOT NULL,
  "outcome" "AuditOutcome" NOT NULL,
  "actorUserId" TEXT,
  "actorMembershipId" TEXT,
  "tenantId" TEXT,
  "targetType" VARCHAR(128),
  "targetId" VARCHAR(128),
  "policy" VARCHAR(128),
  "reasonCode" VARCHAR(128),
  "correlationId" VARCHAR(36) NOT NULL,
  "traceId" VARCHAR(128),
  "ipHash" VARCHAR(128),
  "userAgentHash" VARCHAR(128),
  "metadata" JSONB NOT NULL,
  "payloadHash" VARCHAR(64) NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retentionUntil" TIMESTAMP(3) NOT NULL,
  "legalHold" BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY ("id")
);
```

The migration adds optional foreign keys:

```sql
"AuditEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

"AuditEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

"AuditEvent_actorMembershipId_tenantId_fkey"
  FOREIGN KEY ("actorMembershipId", "tenantId")
  REFERENCES "Membership"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

The table has an append-only trigger:

```sql
CREATE OR REPLACE FUNCTION public.prevent_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('app.audit_retention_purge', true) = 'true'
     AND OLD."legalHold" = false
     AND OLD."retentionUntil" <= CURRENT_TIMESTAMP THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'AuditEvent is append-only';
END;
$$;

CREATE TRIGGER "AuditEvent_append_only"
BEFORE UPDATE OR DELETE ON "AuditEvent"
FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_event_mutation();
```

The table has forced RLS and these policies:

```sql
ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" FORCE ROW LEVEL SECURITY;

CREATE POLICY "AuditEvent_global_control_insert"
  ON "AuditEvent"
  FOR INSERT
  WITH CHECK (current_setting('app.global_operation', true) = 'true');

CREATE POLICY "AuditEvent_tenant_insert"
  ON "AuditEvent"
  FOR INSERT
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

CREATE POLICY "AuditEvent_retention_delete"
  ON "AuditEvent"
  FOR DELETE
  USING (
    current_setting('app.audit_retention_purge', true) = 'true'
    AND "legalHold" = false
    AND "retentionUntil" <= CURRENT_TIMESTAMP
  );

CREATE POLICY "AuditEvent_global_control_select"
  ON "AuditEvent"
  FOR SELECT
  USING (
    current_setting('app.audit_retention_purge', true) = 'true'
    OR current_setting('app.outbox_dispatcher', true) = 'true'
  );

CREATE POLICY "AuditEvent_tenant_select"
  ON "AuditEvent"
  FOR SELECT
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );
```

The applied migration revokes public update and delete:

```sql
REVOKE UPDATE, DELETE ON TABLE "AuditEvent" FROM PUBLIC;
```

The context helper functions are defined as `LANGUAGE sql`, `STABLE`, `SECURITY INVOKER`, with a controlled search path. The global helper is:

```sql
CREATE OR REPLACE FUNCTION public.app_global_operation_context_is_valid()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT current_setting('app.global_operation', true) = 'true'
$$;
```

The exact applied helper definition should be treated as authoritative if it differs from this abbreviated excerpt; the policy shown above directly checks `current_setting` and does not call the helper.

## Actual OIDC session-creation source path

### `SessionService.createFromOidc`

File:

```text
backend/api/src/auth/session.service.ts
```

The relevant source path is:

```typescript
const operationId = randomUUID();
const user = await this.prisma.withGlobalOperationContext(
  operationId,
  async (transaction) => {
    const userId = await this.resolveOrCreateUserIdInTransaction(
      transaction,
      claims,
      provider,
      email,
    );
    const current = await transaction.user.findUnique({
      where: { id: userId },
    });
    if (!current || !isLoginAllowed(current.status)) {
      throw new AuthenticationError();
    }
    await this.prisma.bindMembershipSelectionContext(transaction, {
      userId,
      operationId: randomUUID(),
    });
    const activeMembershipCount = await countActiveMemberships(
      transaction,
      userId,
      now,
    );
    await this.prisma.bindGlobalOperationContext(transaction, operationId);
    const created = await transaction.appSession.create({
      data: {
        userId,
        tokenHash: this.crypto.hash(cookieValue),
        csrfTokenHash: this.crypto.hash(csrfValue),
        csrfTokenCiphertext: this.crypto.encrypt(csrfValue),
        status: "ACTIVE",
        provider,
        providerSubject: claims.sub,
        providerSessionId: claims.sid,
        issuedAt: now,
        lastUsedAt: now,
        idleExpiresAt,
        absoluteExpiresAt,
        mfaVerifiedAt: claims.amr?.includes("mfa") ? now : undefined,
        mfaAcr: claims.acr,
        mfaAmr: claims.amr,
        providerRefreshTokenCiphertext: this.crypto.encrypt(refreshToken),
      },
    });
    await this.audit.recordInTransaction(
      {
        eventType: "auth.login.succeeded",
        category: "AUDIT",
        outcome: "SUCCEEDED",
        actorUserId: current.id,
        targetType: "AppSession",
        targetId: created.id,
        policy: "Authentication",
        reasonCode: "oidc_authorization_code",
        correlationId: randomUUID(),
        metadata: { activeMembershipCount },
      },
      transaction,
    );
    return created;
  },
);
```

### `PrismaService.withGlobalOperationContext`

File:

```text
backend/api/src/infrastructure/database/prisma.service.ts
```

The relevant implementation is:

```typescript
async withGlobalOperationContext<TResult>(
  operationId: string,
  callback: (transaction: Prisma.TransactionClient) => Promise<TResult>,
): Promise<TResult> {
  assertUuidContextField(operationId, 'operationId');
  return this.$transaction(async (transaction) => {
    await setControlContext(transaction, {
      operationId,
      globalOperation: true,
    });
    return callback(transaction);
  });
}
```

The control-context helper sets transaction-local values through a parameterized raw query:

```typescript
await transaction.$queryRaw`
  SELECT
    set_config('app.tenant_id', '', true),
    set_config('app.user_id', '', true),
    set_config('app.membership_id', '', true),
    set_config('app.operation_id', ${context.operationId}, true),
    set_config('app.global_operation', ${String(context.globalOperation ?? false)}, true),
    set_config('app.outbox_dispatcher', ${String(context.outboxDispatcher ?? false)}, true),
    set_config('app.idempotency_maintenance', ${String(context.idempotencyMaintenance ?? false)}, true),
    set_config('app.audit_retention_purge', ${String(context.auditRetentionPurge ?? false)}, true)
`;
```

`bindGlobalOperationContext(transaction, operationId)` invokes the same control-setting mechanism on the passed transaction client. The source therefore already binds the global operation setting in the same transaction before the `AuditEvent` insert.

### `AuditService.recordInTransaction`

File:

```text
backend/api/src/infrastructure/audit/audit.service.ts
```

The method normalizes and hashes the event, then performs:

```typescript
const event = await transaction.auditEvent.create({
  data: {
    id: randomUUID(),
    eventType: normalized.eventType,
    eventVersion: normalized.eventVersion,
    category: normalized.category,
    outcome: normalized.outcome,
    actorUserId: normalized.actorUserId,
    actorMembershipId: normalized.actorMembershipId,
    tenantId: normalized.tenantId,
    targetType: normalized.targetType,
    targetId: normalized.targetId,
    policy: normalized.policy,
    reasonCode: normalized.reasonCode,
    correlationId: normalized.correlationId,
    traceId: normalized.traceId,
    ipHash: normalized.ipHash,
    userAgentHash: normalized.userAgentHash,
    metadata,
    payloadHash,
    occurredAt,
    retentionUntil,
    legalHold: normalized.legalHold ?? false,
  },
});
```

After the AuditEvent create, it creates the linked outbox row using the same transaction client. There is no detached Prisma client call or fallback context mutation in this method.

## Explicit restricted-role provisioning design

File:

```text
backend/api/scripts/phase2-provision-mohamy-app.sql
```

The user-run template creates or verifies a non-owner runtime role and rejects ownership or membership anomalies. It applies these explicit privileges:

```sql
GRANT USAGE ON SCHEMA public TO mohamy_app;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public."User",
  public."ExternalIdentity",
  public."AppSession",
  public."StorageObject",
  public."OutboxMessage"
  TO mohamy_app;

GRANT SELECT ON TABLE
  public."Membership",
  public."Tenant"
  TO mohamy_app;

GRANT SELECT, INSERT, DELETE ON TABLE public."AuditEvent" TO mohamy_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."IdempotencyKey" TO mohamy_app;
```

It revokes all privileges on public tables, sequences, and functions from the runtime role before applying the explicit grants, removes public schema `CREATE` capability, and grants `EXECUTE` only on the named context helper functions. It does not grant `ALL`, ownership, role membership, or migration privileges. The user executed this template successfully with `COMMIT` on the existing database.

## What has already been rejected

The previous Gemini review proposed adding a new `AuditService.recordGlobal` implementation that sets `app.global_operation` inside a separate method. That proposal is rejected because the actual failing OIDC path already uses `withGlobalOperationContext`, sets the value on the same transaction, rebinds it before the audit insert, and uses `recordInTransaction` with the same transaction client.

The previous Gemini diagnostic script is rejected because it used fields not matching the applied schema, hardcoded IDs that can violate foreign-key and check constraints, inserted diagnostic rows into the existing database without a complete cleanup proof, and used a detached direct Prisma client rather than the repository’s actual adapter/context path.

## Required expert analysis

Answer these questions precisely, using only the supplied evidence and source excerpts:

1. Given that the restricted role is `NOSUPERUSER` and `NOBYPASSRLS`, RLS is enabled and forced, the role has the explicit `INSERT` grant on `AuditEvent`, and the source binds `app.global_operation=true` on the same transaction, what concrete PostgreSQL condition can still produce SQLSTATE `42501` on this insert?

2. Is a PostgreSQL RLS `WITH CHECK` failure normally reported as SQLSTATE `42501`, or should the analysis distinguish a missing table privilege from another permission check? State the exact evidence needed and do not infer beyond the evidence.

3. Can an `AuditEvent` INSERT require `REFERENCES`, `SELECT`, `USAGE`, or `EXECUTE` privileges beyond the explicit table `INSERT` grant because of its optional foreign keys, enum columns, JSONB column, UUID/text defaults, or append-only trigger? Identify only privileges that PostgreSQL 16 actually checks for application DML. Distinguish trigger creation-time privileges from trigger firing-time privileges.

4. Could the actual missing privilege be on one of the referenced tables (`User`, `Tenant`, or `Membership`) during foreign-key enforcement? Explain PostgreSQL’s behavior and identify a safe way to test that without inserting arbitrary diagnostic rows or exposing raw data.

5. Could Prisma 7 with the `PrismaPg` adapter be translating a PostgreSQL RLS/policy failure or a privilege failure into P2039 in a way that hides the ordinary error fields? Identify the safest allowlisted fields or bounded SQLSTATE classification to inspect.

6. What exact repository source or applied-schema fact should be checked next? Prefer a read-only diagnostic inside the real session-creation transaction or an administrative catalog inventory. Do not suggest a synthetic write unless it is fully schema-correct, transaction-bound, isolated, and proven to leave zero residue.

7. If a grant is truly missing, name the smallest explicit grant and explain why it is required. Do not recommend blanket grants, `GRANT ALL`, ownership changes, `BYPASSRLS`, permissive policy changes, public grants, or migration role creation.

8. If the issue is not a missing grant, identify the exact source-level correction. Do not propose a second global-context API unless the supplied source is proven wrong.

9. Explain how to verify the correction under the restricted role and how to preserve the separate administrative migration connection. Keep the user-run database/configuration steps separate from repository changes.

10. List the residual Phase 2 evidence still required after the authenticated fixture passes: AuditEvent tenant isolation, append-only enforcement, retention/legal hold, outbox delivery/duplicate suppression/retry/dead-letter, same-session tenant-switch CAS concurrency, and remaining authorization/MFA, CI/topology, generated client, bilingual RTL/LTR, and future Linux KMS/object-storage/TLS boundaries.

## Required response format

Return exactly these sections:

1. **Verified facts versus unsupported assumptions**
2. **Meaning of P2039 / SQLSTATE 42501 in this exact path**
3. **Most likely root cause, with alternatives ranked by evidence**
4. **Minimal complete fix, if justified**
5. **Bounded diagnostic and runtime verification plan**
6. **Unsafe recommendations rejected**
7. **Residual Phase 2 gaps**

Do not return passwords, connection strings, tokens, cookies, authorization codes, raw callback URLs, raw request metadata, raw database rows, raw error messages, or instructions that weaken the security boundary.

## References

[1]: https://www.prisma.io/docs/orm/reference/error-reference "Prisma ORM error reference"
[2]: https://www.prisma.io/changelog/2026-04-27 "Prisma ORM changelog: Catch more database driver errors"
[3]: https://www.postgresql.org/docs/current/ddl-rowsecurity.html "PostgreSQL Documentation: Row Security Policies"
[4]: https://www.postgresql.org/docs/current/ddl-priv.html "PostgreSQL Documentation: Privileges"
[5]: https://www.postgresql.org/docs/current/sql-createtrigger.html "PostgreSQL Documentation: CREATE TRIGGER"
