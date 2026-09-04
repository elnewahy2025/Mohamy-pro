# Phase 18 Implementation Plan: Search Subsystem

I have reviewed the `phase18_implementation_plan.md`. The focus is on a tenant-isolated, permission-aware search architecture using OpenSearch via an abstraction adapter, powered by BullMQ outbox processing.

## User Review Required
> [!IMPORTANT]
> The database migration will drop/add tables to the ephemeral schema via Prisma push/migrate, just as in previous phases. Do I have your approval to modify `schema.prisma` and start scaffolding the OpenSearch integration?
> Note: OpenSearch will not be installed or run natively by me; I will only mock the connection/adapter logic in NestJS to establish the interface contracts for deployment.

## Proposed Changes

### 1. Database Schema
#### [MODIFY] `backend/api/prisma/schema.prisma`
Add operational tracking tables for reindexing:
- `SearchReindexJob`
- `SearchIndexVersion`
- Enums (`SearchReindexStatus`)

### 2. Architecture & Adapters
#### [NEW] `backend/api/src/search/interfaces/`
- `search-provider.interface.ts`
- `search-authorization-context.interface.ts`

#### [NEW] `backend/api/src/search/adapters/`
- `opensearch.adapter.ts`

### 3. Business Logic & Queue Workers
#### [NEW] `backend/api/src/search/`
- `search.service.ts` (Core logic and result normalization)
- `search-authorization-scope.builder.ts` (Ensures tenant-isolation before OpenSearch querying)
- `search-indexer.worker.ts` (BullMQ consumer for indexing Outbox events)

### 4. API Endpoints
#### [NEW] `backend/api/src/search/search.controller.ts`
- `POST /api/v1/search`
- `GET /api/v1/search/suggestions`

#### [NEW] `backend/api/src/search/admin-search.controller.ts`
- `POST /api/v1/admin/search/reindex`

## Verification Plan

### Automated Tests
- Run `pnpm exec prisma format` and `pnpm exec nest build`.
- Validate that the search dependencies and adapters compile successfully.

### Manual Verification
- Verify the `Prisma` schema is accurately synced without errors.

Click **Proceed** if this aligns with the provided Phase 18 blueprint and I will begin the backend implementation!
