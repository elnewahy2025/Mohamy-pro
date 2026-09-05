# G4 Role Management — Implementation + Re-audit (awaiting approval)

**Scope:** G4 only (AUTHORIZATION_GAPS.md G4). No G5–G10 changes. No commits/pushes.

## Implementation (`backend/api/src/roles/`, 6 files)

Versioned guarded controller + operations + service + module, mirroring the
canonical pattern. `CanManageRoles`-gated throughout; tenant RLS via
`withTenantContext` (Role/RolePermission/MembershipRole policies pre-exist):
- `POST /roles` — create tenant roles; built-in keys immutable; duplicates rejected
- `GET /roles` — list with permissions
- `POST /roles/:id/permissions` — grant catalog keys the granter holds (unknown keys, built-ins, and unheld keys rejected)
- `DELETE /roles/:id/permissions` — revoke (audited; accepted self-harm risk documented — recovery via another admin)
- `POST /roles/:id/assign` — granter must hold every key in the role; target membership must be ACTIVE; platform roles unreachable
- `POST /roles/:id/revoke` — soft-revoke (`revokedAt`); self-removal refused (anti-lockout)
- Audit: `ROLE_CREATED`, `ROLE_PERMISSION_GRANTED/REVOKED`, `MEMBER_ROLE_REVOKED` (+ existing `ROLE_ASSIGNED`) across all 5 maps

## Self-escalation matrix (tested)

Non-holder denied at API · `platform.admin` ungrantable/unassignable ·
unknown role/key denied · unheld-key grant denied · inactive target denied ·
self-removal denied · duplicate-safe (upsert/clear-revoked).

## Frontend verification

No role-admin UI exists and none was added (invitation flow remains the
assignment path; it now resolves `tenant.manager` since G3 ensures the row).
Verified: free-text role keys + backend unknown-role rejection render through
the existing invitation error path; no hardcoded roles in UI; no frontend
change required (verified outcome). Web gates 74/74, tsc 0.

## Gates

Roles suite 8/8 · guard spec 22/22 · tsc 0 · prettier clean · nest build 0 ·
prod boot clean + health ok.

## Independent re-audit

Changed surface is exactly G4 (module + wiring + audit maps + guard spec).
No deferred-role code, no assignment/ABAC/break-glass changes, no new
permission keys (reused `CanManageRoles`).

## Verdict: G4 PASS (implementation + independent re-audit)
