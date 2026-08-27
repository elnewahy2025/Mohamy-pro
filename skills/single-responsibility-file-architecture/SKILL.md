---
name: single-responsibility-file-architecture
description: Enforces strict file-level separation of responsibilities. Use whenever creating, modifying, refactoring, or reviewing application code. Each meaningful independent responsibility must live in its own focused file; never bypass this rule for convenience, speed, or smaller diffs.
---

# Single-Responsibility File Architecture

## Mandatory rule

Follow strict single-responsibility file organization.

Give each source file one clear responsibility. Do not place multiple independent functions, features, business operations, utilities, handlers, components, or unrelated logic in one file.

Treat this as an architectural requirement, not a suggestion.

## Required workflow

Before writing or modifying code:

1. Inspect the existing file and state its current responsibility.
2. Identify every responsibility introduced or changed by the task.
3. Decide whether each responsibility belongs in an existing focused file.
4. Create a separate file when a responsibility does not belong in the existing file.
5. Keep orchestration files thin; coordinate focused modules instead of embedding their implementation.
6. Update imports, exports, references, tests, and documentation for every extracted responsibility.

Do not modify untouched legacy code solely for stylistic compliance. When a task affects an existing area, apply the rule to the affected code and do not preserve poor structure merely to minimize the diff.

## Function-level separation

Place meaningful independent operations in separate focused files. Prefer structures such as:

```text
createUser.ts
updateUser.ts
deleteUser.ts
validateUser.ts
calculateInvoiceTotal.ts
```

Do not use dumping-ground files such as `utils.ts`, `helpers.ts`, `common.ts`, or `misc.ts` for unrelated responsibilities. Small helpers may remain together only when they form one cohesive responsibility.

Do not hide unrelated logic inside large classes, large objects, nested functions, anonymous callbacks, giant configuration objects, implementation-bearing barrel files, large switch statements, large conditional chains, or abstraction layers created only to avoid creating separate files.

## Frontend components

Give each meaningful UI component its own file. Extract meaningful sections from large components into focused components. Prefer structures such as:

```text
UserPage.tsx
UserHeader.tsx
UserFilters.tsx
UserTable.tsx
UserActions.tsx
UserPagination.tsx
```

Do not place multiple independent UI sections in one large component.

## Backend and services

Separate these concerns into appropriate focused modules:

```text
Route
Validation
Authorization
Business operation
Data access
External integration
```

Do not place substantial business logic in routes, controllers, UI components, or database modules. Give each independent business operation a focused module.

## Database code

Keep database access separate from business logic. Use focused repository or data-access modules where appropriate. Do not accumulate unrelated queries in a large database file.

## Utility files

Give every utility module a clear purpose. Split unrelated utilities instead of allowing a generic utility file to become a dumping ground.

## File-size signals

Use size as a refactoring signal, while treating responsibility and cohesion as primary:

- Prefer files under 200 lines.
- Review a file approaching 300 lines for decomposition.
- Refactor a file exceeding 400 lines unless a specific technical reason prevents meaningful decomposition.

A short file containing multiple unrelated responsibilities still violates this skill.

## Dependency-chain review

For every significant feature, reason through the complete dependency chain:

```text
Feature
→ UI responsibility
→ Component
→ API responsibility
→ Validation
→ Authorization
→ Business operation
→ Data access
→ External integration
→ Database operation
```

Give each responsibility an appropriate focused module.

## Mandatory verification

Before declaring a task complete, inspect every modified and newly created file. Verify:

- Each file has one clear responsibility.
- No unrelated business logic was introduced.
- No unrelated helper functions were added.
- No responsibility was duplicated.
- No unnecessary code was added.
- File size is reasonable or the exception is documented.
- Imports and exports are correct.
- Affected logic has appropriate tests.
- Further decomposition is not required.

If a violation exists, refactor it before reporting completion.

## Hard stop

If the planned implementation violates this skill, stop. Create the required focused files and separate the responsibilities first. Never knowingly declare completion while the rule is violated.

Follow this skill for every applicable code change, including creation, modification, refactoring, review, tests, and documentation that materially describes the architecture.
