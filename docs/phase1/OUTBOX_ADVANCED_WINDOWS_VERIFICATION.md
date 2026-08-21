# Windows Outbox Advanced-Recovery Verification

**Verification date:** 2026-08-21

**Repository revision:** `cf515a74` (`fix(phase1): make outbox retry job IDs unique`).

## Runtime Boundary

The verification used the real Windows API dispatcher, BullMQ/Redis queue, PostgreSQL database, and production worker. The API and worker were separate processes. Test data used unique identifiers and was removed by the runner after each attempt. No primary or unrelated ERP container was removed or recreated.

## Runner Result

The runner returned exit code 0:

```text
retry_backoff_status=PASS|first_available_at_future=true|delay_ms=1005|second_attempts=2
lease_expiry_status=PASS|reclaimed_attempts=3|final_status=FAILED
duplicate_delivery_status=PASS|job_states=completed,completed|processed_attempts=1
outbox_cleanup_remaining=0
outbox_advanced_result=PASS
node_exit=0
```

## Corroborating Process Evidence

The API logged dispatcher submissions for the controlled test messages:

```text
Submitted 1 outbox message(s) to the worker queue
Submitted 1 outbox message(s) to the worker queue
Submitted 2 outbox message(s) to the worker queue
Submitted 2 outbox message(s) to the worker queue
```

The production worker logged distinct per-attempt BullMQ job IDs and completed the intentionally failing jobs without process termination:

```text
Completed outbox job outbox-phase1-retry-...-attempt-1
Completed outbox job outbox-phase1-retry-...-attempt-2
Completed outbox job outbox-phase1-retry-...-attempt-3
Completed outbox job outbox-phase1-retry-...-attempt-4
Completed outbox job outbox-phase1-lease-...-attempt-2
Completed outbox job outbox-phase1-lease-...-attempt-3
Completed outbox job phase1-duplicate-...-a
Completed outbox job phase1-duplicate-...-b
```

The worker also emitted the expected handler-failure category for the intentionally unregistered event types. Those errors were expected test stimuli; the worker completed each BullMQ job and continued operating.

## Evidence Conclusions

The following Windows runtime gates are **PASS**: retry delay scheduling into a future `availableAt`, retry delivery on a later attempt, expired-lease reclamation with a new lease token, unique per-attempt BullMQ job identity, duplicate delivery as a no-op for an already processed message, and zero residual test rows after cleanup.

## Graceful Shutdown Evidence

After the runtime runner completed successfully, the user stopped the worker first and the API second with `Ctrl+C` in their Windows PowerShell terminals. The user reported: **"Terminal 2 and 1: returned to the prompt without an error."** No shutdown error, forced process termination, or infrastructure-container stop was reported. This closes the graceful-shutdown gate as **PASS based on the captured user runtime report**. Full terminal shutdown log text was not retained, so the evidence source is explicitly the user's direct Windows execution report rather than a pasted process transcript.

## Final Outbox Gate Status

All advanced-recovery sub-gates are now evidenced: retry backoff, lease expiry reclamation, unique per-attempt job IDs, duplicate-delivery no-op behavior, cleanup, and clean shutdown of both production processes. The outbox verification remains subject to the Windows-Docker deployment boundary documented in `WINDOWS_DOCKER_CLOSURE_BOUNDARY.md`.
