# Phase 12 — Hearing Management + Internal Calendar (Core Delivery Review)

## Objective
Implement the backend foundation for Hearing Management from `Plan.txt`, enabling the tracking of case hearings, dates, outcomes, assigned lawyers, and continuations via a unified internal calendar structure.

## Deliverables
- **Data Model**: Implemented the `Hearing` model in `schema.prisma`, mapping relationships to `Case`, `Court`, `CourtLocation`, and `Membership` (assigned lawyer). Implemented a `nextHearingId` self-relation to support a linked list of consecutive hearings.
- **Operations & Logic**: Added `HearingOperations`, `HearingService`, and `HearingController` for secure creation, updates, outcome recording, and listing.
- **Access Control**: Added `CAN_MANAGE_HEARINGS` permission to `permission.constants.ts` to enforce tenant security constraints.
- **Audit Logging**: Recorded detailed system events to the timeline schema including `hearing.created`, `hearing.updated`, `hearing.deleted`, and `hearing.outcome.recorded`.

## Validation and QA
- [x] TypeScript compilation (`tsc --noEmit`) passes cleanly.
- [x] Code is properly formatted using the standard `prettier` rules.
- [x] Prisma migrations were properly generated and applied with zero data loss.

## Next Steps
The Hearing Management backend foundation is sealed. We are prepared to start integration of the Legal Deadline Engine (Phase 13) or begin visualizing the calendar features in the UI.
