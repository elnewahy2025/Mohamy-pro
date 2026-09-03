# Phase 9: Court, Jurisdiction, and Country Legal Configuration

**Plan status:** DELIVERED
**Delivery Date:** 2026-09-03

## Objective
This phase establishes the foundational dictionary and configuration tables for internationalized legal operations. By decoupling countries, jurisdictions, and courts from hardcoded lists, we allow the platform to support various legal systems seamlessly while giving tenants the ability to add their own custom courts or specific branches.

## Architecture: Hybrid Tenancy Strategy
To allow global predefined dictionaries while enabling tenants to add their own custom courts (or overrides), we implemented a Hybrid Tenancy model:
- `tenantId` is an optional relation. 
- Null `tenantId` implies a global dictionary entry (System-wide).
- Specific `tenantId` implies it belongs only to that tenant.

## Implementation Details

### 1. Database Schema (`prisma/schema.prisma`)
Added the following models:
- **`Country`**: A global dictionary of supported countries (e.g., ISO code, Name).
- **`Jurisdiction`**: Global or Tenant-specific configurations of jurisdictions (e.g., State, Province, Federal).
- **`Court`**: Represents a court instance (e.g., "Dubai Courts", "DIFC Courts").
- **`CourtLocation`**: Physical locations and branches for courts.

Appropriate unique constraints, indices, and foreign keys were added to ensure referential integrity while isolating tenant-specific configurations.

### 2. Security & Audit (`backend/api/src/permissions/permission.constants.ts`)
- Registered a new permission: `CAN_MANAGE_LEGAL_CONFIG` (`CanManageLegalConfig`) to control who can add/edit tenant-specific courts, jurisdictions, and rules.
- Added audit event types: `COUNTRY_CREATED`, `JURISDICTION_CREATED`, `COURT_CREATED`, and `COURT_LOCATION_CREATED` via `AUDIT_EVENT_TYPES`.

### 3. API Module (`backend/api/src/legal-config/`)
Created a dedicated module handling the business logic for these settings:
- **`legal-config.module.ts`**: Encapsulates dependencies.
- **`legal-config.operations.ts`**: Extracts request session securely and audits changes seamlessly via `AuditEventService`. Controls scope-level tenancy via Prisma Row Level Security contexts (RLS). Exposes `assertPermission` to ensure strict checking against `PermissionsService` before passing into `PrismaService`.
- **`legal-config.service.ts`**: CRUD logic for Courts, Jurisdictions, etc., enforcing `hybridReadWhere(ctx)` for reads and strictly executing writes via RLS boundaries.
- **`legal-config.controller.ts`**: REST endpoints mapped to standard CRUD. Protected by `SessionGuard` and `CsrfGuard`.

## Verification & QA Gates
- Comprehensive unit tests created in `legal-config.service.spec.ts` mocking the complex operations context.
- Execution passed 100% of all cases via Jest.
- Full type-safety verified strictly with `tsc --noEmit`.
- Compliant with single responsibility and engineering governance skills.

> [!NOTE]
> Database migration `20260904150000_phase9_legal_config` was manually compiled to prevent data drift wiping on active remote environments while maintaining exact matching for `PrismaClient` generation.
