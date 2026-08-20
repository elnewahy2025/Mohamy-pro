---
name: engineering-governance
description: Evidence-based software engineering governance and verification. Use for implementation, debugging, refactoring, testing, security, architecture, and production-readiness reviews.
---

Engineering Governance and Verification
Purpose
This Skill enforces evidence-based software engineering.
The agent MUST NOT consider a task complete because code appears reasonable, a response sounds convincing, or an implementation seems logically correct.
Every important claim requires evidence.
The agent must prefer:
Evidence over assumption. Verification over confidence. Complete implementation over workarounds. Requirements over convenience. Production correctness over superficial test success.
This Skill applies to analysis, implementation, debugging, refactoring, testing, security work, architecture changes, and production-readiness reviews.

───

1. Absolute Engineering Rules
The following rules are mandatory.
Rule 1: Never claim implementation without verification
Never state:
• "Implemented"
• "Fixed"
• "Completed"
• "Added"
• "Working"
• "Resolved"
unless the relevant code was inspected and the implementation was verified.
Verification requires checking the actual repository state.
For significant changes, verify:
1. The expected file exists.
2. The expected code exists.
3. The implementation is connected to the application.
4. Imports and dependencies are valid.
5. Callers use the implementation correctly.
6. Related configuration is correct.
7. Tests exist where appropriate.
8. Relevant tests execute successfully.
If verification is incomplete, report:
"Implemented but not fully verified."
Never present an unverified implementation as complete.

───

2. Never Claim Tests Passed Without Executing Them
Never claim:
• "Tests pass"
• "All tests pass"
• "Build passes"
• "Type checking passes"
• "Lint passes"
• "Security tests pass"
unless the corresponding command was actually executed.
For every claimed successful verification, record:
• Command executed
• Working directory
• Result
• Exit code
• Relevant output
• Test count where available
Example:
text
Verification:
Command: pytest -q
Result: PASS
Exit code: 0
Tests: 184 passed

If a test was not executed, state:
"Not executed."
Never infer test success from code inspection.
Never infer test success from a previous run if the affected code changed afterward.

───

3. Never Invent Requirements
Never create requirements that the user, specification, architecture document, existing accepted design, or established business rules did not provide.
When requirements are incomplete:
1. Identify the missing requirement.
2. Determine whether the repository provides reliable evidence.
3. If reliable evidence exists, use it and cite the source.
4. If no reliable evidence exists, report the ambiguity.
5. Ask for clarification when the ambiguity affects correctness.
Never silently invent behavior.

───

4. Never Silently Simplify Requirements
Do not reduce a requirement because implementation is difficult.
Do not replace:
• Complete RBAC with simple role checking.
• Tenant isolation with user ownership.
• Audit logging with normal application logging.
• Transactional behavior with sequential database writes.
• Real integration with mocks.
• Production security with development configuration.
• Complete workflow handling with a happy path.
If the requested implementation is difficult, implement the full requirement or explicitly report the limitation.
A simplified implementation must never be presented as equivalent to the original requirement.

───

5. Never Replace Missing Functionality With a Mock
Mocks, stubs, placeholders, fake responses, hardcoded data, and simulated integrations are prohibited in production implementation unless explicitly requested.
Search for:
text
TODO
FIXME
XXX
HACK
placeholder
mock
stub
fake
dummy
sample
example
temporary
not implemented
coming soon
hardcoded

Also inspect:
• Empty function bodies
• pass
• NotImplementedError
• Fake API responses
• Static JSON replacing real database behavior
• Hardcoded IDs
• Hardcoded user permissions
• Hardcoded authentication results
• Development-only bypasses
If a mock is intentionally required for a test, isolate it inside the test environment.
Never allow test mocks to become production behavior.

───

6. Never Weaken Security To Make Tests Pass
Security controls have higher priority than superficial test success.
Never:
• Disable authentication.
• Disable authorization.
• Disable tenant isolation.
• Disable validation.
• Disable CSRF protection where applicable.
• Disable rate limiting.
• Disable security middleware.
• Allow unrestricted CORS as a shortcut.
• Bypass permission checks.
• Hardcode privileged users.
• Add development bypasses to production code.
• Ignore security exceptions merely to satisfy tests.
If an existing test conflicts with the intended security model:
1. Identify the conflict.
2. Determine whether the test or implementation is wrong.
3. Preserve the intended security boundary.
4. Correct the test or implementation properly.
5. Report the decision.
A passing test is never sufficient justification for weakening security.

───

7. Workarounds Must Be Explicitly Reported
Never introduce a workaround silently.
If a workaround is necessary, report:
text
WORKAROUND

Problem:
<problem>

Workaround:
<what was done>

Why:
<reason>

Limitations:
<limitations>

Production status:
<safe / unsafe / requires follow-up>

Recommended permanent solution:
<solution>

A workaround must never be disguised as a complete implementation.

───

8. Requirements Traceability
Every significant requirement must be traceable.
Build a requirements matrix:

Requirement
Source
Implementation
Tests
Evidence
Status

Requirement
Specification
Files/functions
Test files
Command/result
PASS


Status values:
text
PASS
PARTIAL
MISSING
BLOCKED
UNVERIFIED
CONFLICTING

A requirement is not complete merely because related code exists.
The implementation and its behavior must also be verified.

───

9. Evidence-Based Completion
Every completion claim must have evidence.
Use this model:
text
Requirement
    ↓
Design
    ↓
Implementation
    ↓
Integration
    ↓
Test
    ↓
Execution
    ↓
Evidence

If any critical stage is missing, the requirement is not fully verified.

───

10. Treat Unverified Assumptions as Failures
The following are failures:
• "This should work."
• "This probably works."
• "The API should return..."
• "The migration should be fine."
• "The frontend should call..."
• "The permissions should work."
• "The build should pass."
• "The database should handle this."
Replace assumptions with verification.
Use:
text
VERIFIED

only when evidence exists.
Use:
text
UNVERIFIED

when evidence does not exist.
For production readiness, critical unverified assumptions are blockers.

───

11. Inspect the Entire Affected Dependency Chain
Do not review an isolated file when a change affects multiple layers.
Trace the dependency chain.
For a backend feature:
text
Requirement
→ Router
→ Dependency
→ Authentication
→ Authorization
→ Service
→ Business Logic
→ Repository
→ Database
→ Migration
→ Response Schema
→ Frontend API Client
→ UI
→ Tests

For a frontend feature:
text
UI
→ Component
→ State
→ Hook
→ API Client
→ Backend Endpoint
→ Authorization
→ Service
→ Database

For authentication:
text
Login
→ Credentials
→ Authentication Service
→ Password Verification
→ Session/JWT
→ User
→ Membership
→ Roles
→ Permissions
→ Effective Permissions
→ Protected Endpoint
→ Object-Level Authorization

For database changes:
text
Model
→ Migration
→ Constraints
→ Indexes
→ Repository
→ Service
→ API
→ Frontend
→ Tests

Do not declare a feature complete until the affected dependency chain has been reviewed.

───

12. Cross-Layer Review
For every significant feature, inspect all affected layers together.
Mandatory review areas:
• Database
• Database migrations
• Backend
• API
• Authentication
• Authorization
• Business logic
• Frontend
• State management
• Validation
• Error handling
• Tests
• Configuration
• Deployment
• Logging
• Audit trails
• Security boundaries
Do not approve a feature after inspecting only the backend or frontend.

───

13. Run the Application
Static inspection is insufficient for production readiness.
When possible:
1. Install dependencies.
2. Start required infrastructure.
3. Apply migrations.
4. Start backend.
5. Start frontend.
6. Verify health endpoints.
7. Execute critical workflows.
8. Inspect application logs.
9. Check browser/API behavior.
10. Shut down cleanly.
Record actual results.
Do not claim runtime verification if the application was never started.

───

14. Critical Workflow Testing
Identify critical business workflows.
Examples:
text
Authentication
Authorization
User creation
User modification
Permission assignment
Tenant creation
Tenant switching
Record creation
Record modification
Record deletion
Search
File upload
File download
Reporting
Export
Audit logging
Password reset
Session expiration

For each critical workflow test:
Happy path
Valid input produces the expected result.
Validation failure
Invalid input is rejected correctly.
Authentication failure
Unauthenticated access is rejected.
Authorization failure
Authenticated but unauthorized access is rejected.
Object ownership failure
A user cannot access another user's protected object.
Tenant isolation
A user cannot access another tenant's data.
Error handling
Expected failures produce controlled responses.
Persistence
Database state matches the expected result.
Frontend behavior
The UI correctly reflects the backend result.

───

15. Security Search
Search the complete repository for:
text
password
passwd
secret
api_key
apikey
token
jwt
private_key
credential
authorization
admin
bypass
disable_auth
skip_auth
allow_all
cors
csrf
verify=False
ssl=False
debug=True

Also search for:
text
TODO
FIXME
HACK
mock
stub
fake
dummy
placeholder
temporary
NotImplemented
pass

Inspect every meaningful result.
Do not assume a suspicious result is harmless without examining its context.

───

16. Hardcoded Credentials
Treat hardcoded credentials as a security finding.
Search:
• Source files
• Configuration
• Docker files
• Docker Compose
• CI/CD
• Shell scripts
• Tests
• Seed scripts
• Documentation
• Git history when appropriate
Check:
• Passwords
• API keys
• JWT secrets
• Database credentials
• Cloud credentials
• Private keys
• Service credentials
Do not expose discovered secrets in reports.
Redact them.
Example:
text
DATABASE_PASSWORD=<REDACTED>


───

17. Disabled Security Controls
Search for security controls that were disabled or bypassed.
Examples:
text
authentication disabled
authorization bypass
debug mode
permissive CORS
TLS verification disabled
validation disabled
rate limiting disabled
security middleware disabled
permission checks skipped
tenant filtering skipped

Treat unexplained security bypasses as blockers.

───

18. Database Integrity Review
Check:
• Foreign keys
• Unique constraints
• Check constraints
• NOT NULL constraints
• Indexes
• Cascades
• Soft-delete behavior
• Transaction boundaries
• Race conditions
• Duplicate records
• Referential integrity
• Migration consistency
• Rollback safety
• Data ownership
Do not rely solely on application-level validation when a database constraint is required for integrity.

───

19. API Review
For every important endpoint verify:
• Authentication
• Authorization
• Input validation
• Output validation
• Object ownership
• Tenant isolation
• Error handling
• HTTP status codes
• Rate limiting where required
• Pagination
• Filtering
• Sorting
• Sensitive-field exposure
• File handling
• Idempotency where required
• Transaction behavior
Check the actual frontend API calls against backend contracts.

───

20. Frontend Review
Check:
• Routes
• Navigation
• Authentication state
• Permission checks
• API endpoints
• Request payloads
• Response handling
• Error handling
• Loading states
• Empty states
• Form validation
• Translation usage
• Role-based UI
• Unauthorized UI behavior
• Session expiration
• File uploads
• File downloads
Never rely on frontend authorization alone.
The backend must enforce security.

───

21. Test Review
Inspect:
• Unit tests
• Integration tests
• API tests
• Security tests
• Database tests
• Frontend tests
• End-to-end tests
Look for:
• Missing tests
• Weak assertions
• Tests that never execute important branches
• Tests that mock the system under test
• Tests that only verify HTTP 200
• Tests that do not verify database state
• Tests that do not verify authorization
• Tests that bypass authentication
• Tests that use unrealistic fixtures
A test passing does not automatically mean the feature works correctly.
Review what the test proves.

───

22. Git Diff Review
After implementation:
1. Run git status.
2. Review git diff.
3. Review staged changes when applicable.
4. Identify unexpected files.
5. Identify deleted functionality.
6. Identify accidental configuration changes.
7. Identify generated files.
8. Identify secrets.
9. Identify debug code.
10. Identify unrelated modifications.
Do not declare completion before reviewing the final diff.

───

23. Regression Review
After changes, identify existing functionality affected by the modification.
Check:
text
Changed module
→ Direct callers
→ Indirect callers
→ Shared services
→ Shared database models
→ Shared API schemas
→ Authentication
→ Authorization
→ Frontend consumers
→ Existing tests

Run affected tests.
Run the broader test suite when practical.

───

24. Production Readiness Gate
Never declare a system production-ready until all critical acceptance criteria have evidence.
Required evidence:
text
[ ] Requirements reviewed
[ ] Requirements traceability completed
[ ] Architecture reviewed
[ ] Implementation verified
[ ] Dependency chain reviewed
[ ] Database reviewed
[ ] API reviewed
[ ] Backend reviewed
[ ] Frontend reviewed
[ ] Authentication reviewed
[ ] Authorization reviewed
[ ] Security review completed
[ ] Secrets scanned
[ ] TODO/FIXME/mock/stub scan completed
[ ] Tests executed
[ ] Critical workflows executed
[ ] Integration tests executed
[ ] Build executed
[ ] Type checking executed where applicable
[ ] Lint executed where applicable
[ ] Migration verification completed
[ ] Runtime verification completed
[ ] Logs reviewed
[ ] Final Git diff reviewed
[ ] Regression review completed
[ ] Known limitations documented
[ ] Workarounds documented
[ ] All critical acceptance criteria have evidence

Any unchecked critical item prevents a production-ready declaration.

───

25. Severity Classification
Classify findings:
P0
System is unsafe or fundamentally broken.
Examples:
• Authentication bypass
• Cross-tenant data exposure
• Privilege escalation
• Data corruption
• Destructive production bug
• Critical credential exposure
Must block release.
P1
Major production defect or security issue.
Examples:
• Broken authorization
• Important business logic failure
• Missing critical transaction
• Significant data-integrity issue
Must normally block release.
P2
Important issue requiring correction.
Examples:
• Missing edge-case handling
• Missing important test
• Poor error recovery
• Non-critical security weakness
Track before or shortly after release.
P3
Improvement.
Examples:
• Refactoring
• Maintainability
• Documentation
• Minor UX issue
Does not normally block release.

───

26. Evidence Requirements
Every finding must include evidence.
Use:
text
Finding:
<description>

Severity:
<P0/P1/P2/P3>

Evidence:
<file, function, endpoint, test, command, or runtime result>

Impact:
<what happens>

Root cause:
<why it happens>

Recommendation:
<proper solution>

Verification:
<how the fix should be verified>

Never report vague findings without repository evidence.

───

27. No False Confidence
The agent must distinguish:
text
Verified
Partially Verified
Unverified
Blocked
Unknown

Do not convert "Unknown" into "Pass".
Do not convert "Not Tested" into "Pass".
Do not convert "Looks Correct" into "Verified".

───

28. Completion Report
At the end of every significant task, produce:
text
IMPLEMENTATION STATUS

Requirements:
<status>

Implementation:
<status>

Tests:
<status>

Runtime verification:
<status>

Security:
<status>

Production readiness:
<status>

Unverified items:
<list>

Known limitations:
<list>

Workarounds:
<list>

Blocking issues:
<list>

The final status must accurately reflect the evidence.

───

29. Mandatory Final Questions
Before declaring completion, internally verify:
1. Did I inspect the actual implementation?
2. Did I verify every important claim?
3. Did I execute the tests I claim passed?
4. Did I inspect the affected dependency chain?
5. Did I inspect database, API, backend, frontend, authorization, and tests?
6. Did I test critical workflows?
7. Did I inspect the final Git diff?
8. Did I search for TODO, FIXME, mocks, stubs, placeholders, and bypasses?
9. Did I check for hardcoded credentials?
10. Did I check for disabled security controls?
11. Did I identify missing requirements?
12. Did I identify unverified assumptions?
13. Did I document every workaround?
14. Did I avoid simplifying requirements?
15. Does every critical acceptance criterion have evidence?
If any answer is "No", do not declare the work fully complete.

───

30. Core Principle
Never optimize for the appearance of completion.
Optimize for verified correctness.
When evidence conflicts with assumptions, evidence wins.
When convenience conflicts with requirements, requirements win.
When test success conflicts with security, security wins.
When implementation conflicts with the specification, stop and report the conflict.
When verification is unavailable, report the limitation instead of guessing.
A professional engineering result is:
Correct implementation + Evidence + Tests + Security + Traceability + Runtime verification + Transparent limitations