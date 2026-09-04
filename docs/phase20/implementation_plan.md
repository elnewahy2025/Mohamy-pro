# Phase 20 Implementation Plan: Time Tracking

Based on `Plan.txt`, Phase 20 focuses on capturing billable time accurately and safely. The backend will provide robust time entry management, live timer synchronization, and a billing-ready rates engine.

## User Review Required
> [!IMPORTANT]
> Since this phase handles billable amounts (money), the system will use strict integer minor units (e.g., cents/halalas) or fixed-precision decimals for rates and amounts.
> I will add the necessary models to the Prisma schema, and configure the time-tracking modules. Do you approve the schema additions and the plan?

## Proposed Changes

### 1. Database Schema
#### [MODIFY] `backend/api/prisma/schema.prisma`
Add the following Phase 20 tracking models and enums:
- `enum TimeEntryStatus` (DRAFT, SUBMITTED, APPROVED, REJECTED, INVOICED)
- `enum RateType` (USER, CLIENT, CASE, DEFAULT)
- `enum TimerStatus` (RUNNING, PAUSED, COMPLETED, CANCELLED)
- `model TimeEntry` (Records billable/non-billable hours against cases/clients)
- `model Rate` (Configures overriding hourly rates based on entity type)
- `model Timer` (Persists the state of an active timer so it survives browser reloads)

### 2. Time Tracking Module
#### [NEW] `backend/api/src/time-tracking/`
- `time-tracking.module.ts`
- `time-entry.service.ts` (Handles manual entries, submission, and approval flows)
- `time-entry.controller.ts`
- `timer.service.ts` (Handles start, pause, resume, and stop-to-entry transitions)
- `timer.controller.ts`
- `rate.service.ts` (Calculates the correct rate for a given user/case combination)
- `rate.controller.ts`

### 3. Architecture & Integration
#### [MODIFY] `backend/api/src/app.module.ts`
- Integrate `TimeTrackingModule`.

## Verification Plan

### Automated Tests
- Run `pnpm exec prisma format` and `prisma db push` to verify database synchronization.
- Build the NestJS application with `pnpm exec nest build`.

### Manual Verification
- Review the `schema.prisma` definitions for strict tenant isolation (`tenantId` bounds).

Click **Proceed** to approve this plan, and I will begin the backend implementation for Phase 20!
