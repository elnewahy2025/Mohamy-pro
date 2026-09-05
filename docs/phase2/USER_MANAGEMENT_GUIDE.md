# User Management Guide — Creating Users and Assigning Roles

**Scope:** operator runbook for identity administration (invite → roles → sign-in).
No code changes; all actions use shipped API/UI except the first-admin bootstrap.

## 1. First admin (one time, fresh database)

If no admin exists, promote directly in the database (PowerShell):

```powershell
# Save as grant.sql, replacing the three IDs (find them with SELECTs first)
Get-Content grant.sql | pnpm --filter api exec prisma db execute --stdin
```

```sql
INSERT INTO "MembershipRole" (id, "tenantId", "membershipId", "roleId", "assignedAt")
VALUES (gen_random_uuid(), '<tenant-id>', '<membership-id>', '<role-id>', now())
ON CONFLICT DO NOTHING;
```

Find the IDs with:

```sql
SELECT id FROM "Tenant" WHERE slug = 'demo-tenant';
SELECT id, "userId", status FROM "Membership" WHERE "tenantId" = '<tenant-id>';
SELECT id, key FROM "Role" WHERE "tenantId" = '<tenant-id>' AND key = 'tenant.admin';
```

Verify:

```sql
SELECT r.key FROM "MembershipRole" mr JOIN "Role" r ON r.id = mr."roleId"
WHERE mr."membershipId" = '<membership-id>' AND mr."revokedAt" IS NULL;
```

Sign out and sign back in — permissions evaluate per request, so admin powers apply on next login.

## 2. Creating users (admin, via UI)

1. Sign in as the admin.
2. Open `/identity/invitations/create`, enter the user's email + role keys
   (e.g. `tenant.admin`, `tenant.manager`, or a custom key). Unknown keys are
   rejected by the backend with a displayed error.
3. The user accepts the invitation (`/identity/invitations/accept`) and signs
   in via the identity provider.

## 3. Managing roles (admin, via UI)

Open `/identity/roles`:
- **Roles** — list all tenant roles with permission counts.
- **Create and grant** — create custom keys (`support.lead` format), then grant
  catalog permissions. Built-in roles are immutable; unheld keys are rejected
  (no self-escalation).
- **Assign and revoke** — attach any role to any membership ID. Self-removal
  is refused (anti-lockout); unknown roles/memberships are rejected.

## 4. Rules enforced everywhere (backend, not UI)

- Every roles endpoint requires `CanManageRoles` + session + CSRF.
- Granters can only give permissions they hold; `platform.admin` is ungrantable.
- All changes are audited (`role.created`, `role.permission.granted/revoked`,
  `role.assigned`, `member.role.revoked`).
- Tenant isolation is absolute: roles, assignments, and denials never cross tenants.

## 5. Available roles

| Key | Powers | How obtained |
|---|---|---|
| `tenant.admin` | All tenant permissions | Bootstrap, invitation, or §1 SQL |
| `tenant.manager` | View + approve time/workflows/invoices/payments | Invitation or `/identity/roles` assignment (row ensured by startup reconcile) |
| `platform.admin` | Cross-tenant superuser | Bootstrap only, never grantable |
| custom (e.g. `support.lead`) | Whatever is granted to it | Created at `/identity/roles` |

Deferred by design: Managing Partner / Lawyer / Paralegal / Client roles
(see `G3_ROLE_CONSISTENCY.md` for blockers).
