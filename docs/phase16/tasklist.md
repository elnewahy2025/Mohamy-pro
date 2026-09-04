# Phase 16: Document Security Backend

- `[x]` Define Phase 16 Enums and Tables in `backend/api/prisma/schema.prisma`
- `[x]` Add `tenantId` and `FORCE ROW LEVEL SECURITY` requirements for new tables
- `[x]` Run `npx prisma format` and generate migration
- `[x]` Scaffold `documents/security` module in `backend/api/src/documents/`
- `[x]` Define adapter interfaces (`malware-scanner`, `kms-provider`)
- `[x]` Implement MinIO/ClamAV/Vault/BullMQ service adapters
- `[x]` Implement `DocumentSecurityService` (Upload state machine)
- `[x]` Implement `SignedAccessService` (URL generation and TTL/revocation)
- `[x]` Implement `SecurityAuditService` (Download and share tracking)
- `[x]` Add Phase 16 endpoints (`document-security.controller.ts`)
- `[x]` Ensure code is Prettier-clean and tests/build pass
- `[x]` Create final Completion Report walkthrough
