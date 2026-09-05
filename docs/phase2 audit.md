Phase 2 Re-Validation + Authorization Traceability Audit

You are taking over an existing legal platform project.

The project has already progressed through Phase 23.

Do NOT assume that Phase 2 is correct because later phases were implemented successfully.

Your task is to perform a retrospective, evidence-based re-validation of Phase 2 and then trace the authorization architecture through every implemented phase up to Phase 23.

The authoritative execution plan is the project's current phased plan.

Do not redesign the phase sequence.

Do not rewrite later phases.

Do not claim compliance without verifying the repository.

---

1. Primary Objective

Re-audit Phase 2:

"Phase 2 - Identity + Multi-Tenancy"

Verify whether the implementation actually satisfies every Phase 2 requirement.

Then verify whether the Phase 2 authorization model is correctly consumed by all implemented phases through:

"Phase 3 -> Phase 23"

The audit must focus heavily on:

- RBAC
- ABAC
- Resource-level authorization
- Explicit denials
- Tenant isolation
- Membership-based tenant context
- Permission evaluation
- Role assignment
- Permission assignment
- Authorization enforcement
- Backend authorization
- Authorization testing
- Authorization documentation
- Cross-phase authorization consistency

---

2. Repository First

Before making any judgment:

1. Inspect the repository structure.
2. Read the current project documentation.
3. Locate the original Phase 0 decision documents.
4. Locate all authorization-related documents.
5. Locate the Phase 2 implementation.
6. Locate migrations and database models.
7. Locate authorization services, guards, middleware, policies, decorators, or equivalent mechanisms.
8. Locate authentication and membership implementation.
9. Locate authorization tests.
10. Locate all implemented phases through Phase 23.
11. Locate all documentation referring to authorization, roles, permissions, tenant isolation, security, or access control.

Do not rely on filenames alone.

Read the actual contents.

---

3. Required Documents to Verify

Explicitly search for and inspect these documents if present:

- "PROJECT_REFERENCE.md"
- "ARCHITECTURE.md"
- "DOMAIN_MODEL.md"
- "DATABASE.md"
- "API.md"
- "SECURITY.md"
- "AUTHORIZATION.md"
- "AUTHORIZATION_MATRIX.md"
- "MULTI_TENANCY.md"
- "PHASE_DEPENDENCIES.md"
- "THREAT_MODEL.md"
- "TESTING.md"
- "OBSERVABILITY.md"
- "MIGRATION_POLICY.md"
- "DEPLOYMENT.md"
- "ROADMAP.md"

Also locate any additional authorization-related documentation created after Phase 0.

Do not assume these files exist.

Report:

- Found
- Missing
- Outdated
- Contradictory
- Partially implemented
- Not connected to implementation

---

4. Phase 2 Requirement-by-Requirement Audit

Audit every Phase 2 requirement individually.

Create an evidence matrix containing:

Requirement| Expected Behavior| Implementation| Evidence| Tests| Status| Severity

Use only these statuses:

- PASS
- PARTIAL
- FAIL
- MISSING
- NOT VERIFIED

Do not use vague statuses such as "Looks good".

---

5. Identity and Membership Audit

Verify:

- User
- Membership
- Tenant
- Organization
- Branch
- Department
- Team
- Role
- Permission
- Direct Permission
- Denial

Verify relationships between all of them.

Confirm whether the actual database model matches the documented model.

Check:

- Foreign keys
- Unique constraints
- Check constraints
- Indexes
- Cascades
- Soft deletion behavior
- Active/inactive membership behavior
- Role assignment integrity
- Permission assignment integrity

---

6. RBAC Audit

Perform a dedicated RBAC audit.

Verify:

Roles

- Role model
- Role scope
- Role lifecycle
- System roles
- Tenant roles
- Role assignment
- Role removal
- Role activation/deactivation
- Role management authorization

Permissions

Verify:

- Permission model
- Permission naming
- Permission taxonomy
- Permission uniqueness
- Permission grouping
- Role-permission relationships
- Direct permissions
- Permission revocation

Effective Permissions

Determine exactly how the system calculates:

"Effective Permissions = Roles + Direct Permissions + Policy Constraints - Explicit Denials"

Do not assume this formula exists.

Inspect the actual implementation and document the real behavior.

Denials

Verify:

- Denial model
- Denial scope
- Denial precedence
- Denial evaluation
- Denial management
- Protection against bypassing denials

---

7. ABAC Audit

Verify how contextual authorization works.

Check whether authorization considers relevant attributes such as:

- Tenant
- Organization
- Branch
- Department
- Team
- Membership status
- User attributes
- Resource attributes
- Case assignment
- Resource classification
- Workflow state
- Other documented policy attributes

For each implemented ABAC rule:

1. Locate the policy.
2. Locate its implementation.
3. Locate its tests.
4. Verify enforcement at the backend boundary.

---

8. Resource-Level Authorization Audit

This is mandatory.

Do not stop at checking whether a user has a permission.

Verify whether the user is authorized to access the specific resource.

Examples:

- Lawyer with "case.read" accessing an assigned case.
- Lawyer with "case.read" accessing an unassigned case.
- Branch user accessing another branch's case.
- User accessing another tenant's document.
- User accessing another user's restricted resource.
- Manager accessing resources outside the manager's scope.

Test both:

"Permission = ALLOW + Resource = ALLOW"

and:

"Permission = ALLOW + Resource = DENY"

---

9. Tenant Isolation Audit

Verify the complete tenant boundary.

Trace:

"Authentication"
-> "Membership"
-> "Tenant Context"
-> "Authorization"
-> "Database Query"
-> "Resource"

Verify that tenant context is derived from authenticated membership.

Verify that browser-supplied "tenant_id" is never treated as a trusted security boundary.

Search the entire repository for dangerous patterns such as:

- Direct tenant_id trust
- Client-provided tenant context
- Missing tenant filters
- Cross-tenant queries
- Authorization checks performed only in frontend
- IDOR vulnerabilities
- Resource lookup before authorization
- Tenant context fallback behavior

Test:

- Tenant A -> Tenant A = ALLOW
- Tenant A -> Tenant B = DENY

Also test indirect access paths.

---

10. Backend Authorization Enforcement

This is one of the highest-priority sections.

Verify authorization enforcement across:

- Controllers
- API routes
- Application services
- Domain operations
- Background jobs
- Queue consumers
- Scheduled jobs
- File access
- Search
- Reports
- Exports
- Workflow transitions
- Financial operations
- Administrative operations
- Integrations
- AI tool calls where implemented

Identify every location where authorization is enforced.

Identify every location where authorization is missing.

Frontend authorization must never be considered sufficient.

---

11. Authorization Architecture Audit

Determine whether the project has one centralized authorization mechanism.

Verify whether later modules:

- Reuse the same authorization engine
- Reuse the same permission definitions
- Reuse the same policy evaluation
- Reuse the same tenant context
- Reuse the same resource authorization rules

Flag every module that implements its own independent authorization logic.

---

12. Authorization Matrix Audit

Read "AUTHORIZATION_MATRIX.md".

Compare the documented matrix against the actual code.

For every role and permission:

1. Verify the role exists.
2. Verify the permission exists.
3. Verify the relationship exists.
4. Verify the backend enforcement exists.
5. Verify positive tests.
6. Verify negative tests.

Report discrepancies.

The matrix must represent actual behavior, not intended behavior.

---

13. Phase 2 Test Audit

Inspect every existing Phase 2 test.

Verify coverage for:

- Authentication
- Membership
- Tenant context
- RBAC
- ABAC
- Resource authorization
- Explicit denial
- Privilege escalation
- Tenant escape
- IDOR
- Branch isolation
- Unauthorized API access
- Role management
- Permission management

Do not only inspect test names.

Read the test implementation.

Determine whether each test genuinely proves the security property.

---

14. Retrospective Cross-Phase Audit

After completing Phase 2, trace authorization through every implemented phase:

- Phase 3
- Phase 4
- Phase 5
- Phase 6
- Phase 7
- Phase 8
- Phase 9
- Phase 10
- Phase 11
- Phase 12
- Phase 13
- Phase 14
- Phase 15
- Phase 16
- Phase 17
- Phase 18
- Phase 19
- Phase 20
- Phase 21
- Phase 22
- Phase 23

For each phase answer:

1. What resources were introduced?
2. What permissions are required?
3. What roles are allowed?
4. What ABAC rules apply?
5. What resource-level rules apply?
6. What tenant boundaries apply?
7. Where is authorization enforced?
8. Where are authorization tests?
9. What documentation defines the behavior?
10. Does the implementation match the documentation?

---

15. Phase Authorization Traceability Matrix

Produce this matrix:

Phase| Resource| Permission| Role| ABAC Policy| Resource Policy| Backend Enforcement| Tests| Documentation| Status

Every protected resource introduced through Phase 23 must appear.

Do not omit resources because authorization appears obvious.

---

16. Documentation Traceability

Build a second matrix:

Authorization Requirement| Source Document| Phase Introduced| Implementation| Tests| Later Phases Using It| Status

The objective is to establish a traceable chain:

"Requirement"
-> "Architecture"
-> "Database"
-> "API"
-> "Implementation"
-> "Authorization"
-> "Tests"
-> "Documentation"
-> "Later Phase Usage"

Identify every broken link.

---

17. Detect Documentation Drift

Compare documentation against the repository.

Look for:

- Permissions documented but not implemented
- Permissions implemented but undocumented
- Roles documented but missing
- Roles implemented but undocumented
- Authorization rules documented differently from code
- Tenant boundaries documented differently from code
- Old authorization terminology
- Duplicate permission systems
- Contradictory policy definitions
- Phase documents referring to obsolete implementation

Every discrepancy must be reported.

---

18. Security-Critical Checks

Pay special attention to:

- Privilege escalation
- Horizontal privilege escalation
- Vertical privilege escalation
- IDOR
- Tenant escape
- Branch escape
- Role assignment escalation
- Permission assignment escalation
- Self-granting permissions
- Self-promoting to administrator
- Unauthorized role modification
- Unauthorized permission modification
- Direct API bypass
- Background-job bypass
- Queue consumer bypass
- Export bypass
- Search bypass
- File download bypass
- Workflow transition bypass

These are security-critical findings.

---

19. Do Not Modify Code Yet

This task is an audit and verification exercise.

Do not:

- Refactor
- Rewrite
- Fix code
- Change database schema
- Change permissions
- Change roles
- Change phase order
- Add features
- Delete code

First produce the complete evidence-based audit.

Only after the audit is reviewed should implementation changes begin.

---

20. Final Deliverables

Produce these files:

1. "PHASE_2_REVALIDATION_AUDIT.md"

Complete Phase 2 audit.

2. "RBAC_AUTHORIZATION_AUDIT.md"

Dedicated RBAC, ABAC, resource-level authorization, denial, and backend enforcement audit.

3. "AUTHORIZATION_TRACEABILITY_MATRIX.md"

Complete authorization traceability from Phase 0 through Phase 23.

4. "DOCUMENTATION_TRACEABILITY_MATRIX.md"

Mapping between authorization requirements, documentation, implementation, tests, and phases.

5. "AUTHORIZATION_GAPS.md"

Only verified gaps.

Each gap must contain:

- ID
- Severity
- Phase
- Requirement
- Current Behavior
- Expected Behavior
- Evidence
- Security Impact
- Affected Components
- Recommended Resolution
- Required Tests

6. "PHASE_2_REVALIDATION_SUMMARY.md"

Executive summary containing:

- Phase 2 status
- RBAC status
- ABAC status
- Resource authorization status
- Tenant isolation status
- Backend enforcement status
- Test coverage status
- Documentation status
- Cross-phase consistency status
- Critical findings
- High findings
- Medium findings
- Low findings
- Overall recommendation

---

21. Evidence Rules

Every finding must be backed by repository evidence.

For each finding provide:

- File path
- Relevant symbol, class, function, endpoint, migration, or test
- Exact implementation behavior
- Related documentation
- Related test

Do not write:

"Looks correct."

Write:

"Verified in "<path>" where "<symbol>" performs "<behavior>". Test "<test>" verifies "<property>"."

If evidence is missing, mark:

"NOT VERIFIED"

Do not convert absence of evidence into PASS.

---

22. Severity Rules

Use:

CRITICAL

A vulnerability or architectural failure that permits:

- Tenant escape
- Privilege escalation to administrative authority
- Unauthorized access to sensitive legal data
- Authorization bypass
- Destructive unauthorized financial or legal operations

HIGH

A significant authorization failure affecting protected resources or administrative functions.

MEDIUM

A meaningful authorization weakness with limited scope or compensating controls.

LOW

Documentation, consistency, or defense-in-depth issue with limited direct security impact.

---

23. Final Gate

Do not conclude that Phase 2 is complete merely because the application works.

Phase 2 passes only if:

- Identity works
- Membership works
- Tenant context is secure
- RBAC works
- ABAC works where required
- Resource-level authorization works
- Explicit denials work
- Backend authorization is enforced
- Tenant isolation is enforced
- Authorization tests genuinely prove the security properties
- Documentation matches implementation
- Authorization remains consistent through Phase 23
- No critical or high authorization gaps remain unresolved

If any of these are not verified, clearly state the exact reason.

---

24. Important Constraint

You are auditing a system that has already progressed to Phase 23.

Do not assume that later implementation validates earlier architecture.

Perform the audit in this order:

"Phase 0 Authorization Decisions"
-> "Phase 2 Identity + Multi-Tenancy"
-> "Phase 3 Security Foundation"
-> "Phase 4+ Authorization Consumption"
-> "Phase 23"
-> "Cross-Phase Traceability"

The objective is to determine whether the authorization architecture established in Phase 2 is still correct, enforced, tested, documented, and consistently consumed by the system as it exists today.

Do not change the phase sequence.

Do not silently repair gaps.

Audit first.
Report second.
Fix only after approval.