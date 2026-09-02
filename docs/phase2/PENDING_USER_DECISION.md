# Decision: Allowing PENDING Users to Authenticate

## Context
During Phase 2, an issue was raised that the `validateSession` logic was allowing users with a `PENDING` status to successfully log in and establish a session. The original expectation was that only `ACTIVE` users should be permitted to authenticate.

## Assessment
The user state machine requires a state in which a user has registered and verified their email (or logged in via SSO) but has not yet completed the final onboarding/activation steps.

If the authentication guard completely blocked `PENDING` users, they would be unable to access the very onboarding flows required to become `ACTIVE`.

## Decision
**ACCEPTED.** We intentionally allow `PENDING` users to establish a session.

This is a recorded decision to preserve the relaxed state machine constraint for `validateSession`. The frontend and specific API routes will handle gating functionality that requires full `ACTIVE` status, but the core identity platform correctly permits the `PENDING` state to authenticate.
