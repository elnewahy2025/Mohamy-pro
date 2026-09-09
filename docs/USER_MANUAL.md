# Mohamy Pro — User Manual

A page-by-page guide to using the application: what each page is for, how to
use it step by step, which fields are mandatory, and what you must create on
another page first. Screens exist in English and Arabic (language switcher in
Settings); field values such as statuses and types are entered in English
codes as shown.

**Legend:** (R) = required, (O) = optional.

## 1. Getting started

### 1.1 Sign in

- Regular users: open `/auth/login` and press **Sign in**. You are redirected
  to Keycloak; after login you return to the app with a session.
- Admins: open `/admin/login` and press **Sign in with Keycloak**. If you are
  already signed in you see your name and a **Continue to console** link to
  the dashboard.
- To sign out, use the **Sign out** button on the login page.

### 1.2 First-time setup (platform admin, once)

1. In Keycloak, create the admin user and note its user ID.
2. In the API `.env`, set `BOOTSTRAP_SUBJECT` to that ID plus the
   `BOOTSTRAP_*` tenant values, and restart the API.
3. Sign in via `/admin/login`. In Keycloak, complete the **Configure OTP**
   step (bootstrap requires a fresh second factor).
4. Open `/identity/bootstrap`, paste the `BOOTSTRAP_SECRET`, and submit. This
   creates the tenant, the organization, and your platform/tenant admin grant.
   It works exactly once.

### 1.3 Recommended setup order for a new tenant

1. **Organization** — create organization → branch → department (`/organization`).
2. **Users & roles** — create roles (`/identity/roles`), then create users
   (`/identity/users`) and grant them roles.
3. **Legal data** — countries → jurisdictions → courts → locations
   (`/legal-config`).
4. **Clients & parties** — register clients, then parties (`/clients`, `/parties`).
5. **Cases** — open cases for clients (`/cases`).
6. Everything else (hearings, deadlines, tasks, documents, billing) hangs off
   cases created in step 5.

## 2. Identity & access

### 2.1 Users — `/identity/users` (admin)

Create the login account, set its password, invite it to this tenant, and
grant roles — in one action.

1. **Email** (R), **Password** (R, min 12 characters — issued as temporary,
   the user changes it at first login).
2. **Username** (O, 3–64 chars; defaults to the email local part),
   **First/Last name** (O).
3. **Role keys** (R, comma separated, 1–20) — copy exact keys from the Roles
   page, e.g. `tenant.admin, tenant.lawyer`.
4. Press **Create user**. Result shows the invitation ID and expiry.
- Prerequisite: roles must already exist on `/identity/roles`.

### 2.2 Invite member — `/identity/invitations/create` (admin)

For people who already have a login (e.g. created in Keycloak directly).

- **Email** or **Provider subject**: one of the two is required.
- **Role keys** (R, comma separated).
- Optional **Client** link (UUID, for portal memberships).
- Press **Submit**; you receive an invitation token to share.

### 2.3 Accept invitation — `/identity/invitations/accept`

- Paste the **token** (R) and submit. Works without being signed in; sign in
  afterwards to use the membership.

### 2.4 Members — `/identity/members` (admin)

Suspend, expire, remove, or reinstate a membership.

- **Membership ID** (R, UUID) in every action; **Reason** (O); active-from /
  active-to dates where offered.
- Prerequisite: the membership ID (visible after a user accepts an
  invitation or is provisioned).

### 2.5 Roles — `/identity/roles` (admin)

- **List**: no input; shows key, name, permissions.
- **Create**: **Key** (R, e.g. `tenant.lawyer`), **Name** (R),
  **Description** (O).
- **Grant/Revoke permissions**: **Role ID** (R) + **Permission keys** (O,
  comma separated).
- **Assign**: **Role ID** (R) + **Membership ID** (R).
- Prerequisite: membership IDs come from the Members flow.

### 2.6 Switch workspace — `/identity/tenant-switch`

- Enter the target **Tenant ID** (R, UUID) and submit. Prerequisite: you must
  already be a member of that tenant (via invitation there).

## 3. Foundation data

### 3.1 Organization — `/organization` (admin)

Build the hierarchy top-down; each level needs the parent ID from the
previous tab.

- **Organization**: **Slug** (R), **Name** (R). For update/archive add **ID**;
  **Reason** (O, archive).
- **Branch**: same fields + **Organization ID** (R, from the Organization tab).
- **Department**: same fields + **Branch ID** (R, from the Branch tab).
- **Team**: standalone — **Slug** (R), **Name** (R), **Description** (O).
- **Settings**: **Key** (R), **Value** (O, parsed as JSON when possible);
  List/Get/Put buttons.

### 3.2 Legal configuration — `/legal-config` (admin)

Court master data, built strictly top-down; hearings depend on it.

1. **Country**: **Code** (R, 2 letters), **Name** (R). Note the returned ID.
2. **Jurisdiction**: paste **Country ID** (R), **Name** (R).
3. **Court**: paste **Jurisdiction ID** (R), **Name** (R); **Court type** (O:
   CIVIL/CRIMINAL/COMMERCIAL), **Department** (O).
4. **Location**: paste **Court ID** (R), **Name** (R); **City**, **Address**
   (O). The List query needs its own **Court ID** field.

## 4. Clients, parties, conflicts, intake

### 4.1 Clients — `/clients`

The root entity: cases, parties, and conflict checks all reference clients.

- **Client**: **Client type** (R: INDIVIDUAL/ORGANIZATION), **Name** (R);
  **Legal name**, **Source**, **Notes** (O). For update/archive add **ID**;
  **Reason** (O, archive).
- **List**: **Search**, **Status**, **Client type** (all O) + Prev/Next.
- **Contact**: **Client ID** (R, from the Client tab), **Type** (R:
  PHONE/EMAIL/FAX/WEBSITE/MOBILE), **Value** (R); **Label**, **Is primary**,
  **ID** for update/remove (O).
- **Address**: **Client ID** (R); **Type** (R: MAILING/BILLING/REGISTERED/
  BRANCH), **Line 1** (R), **City** (R), **Country** (R); **Line 2**,
  **Region**, **Postal code**, **Is primary** (O).
- No inbound prerequisite. Produces client IDs used across the app.

### 4.2 Parties — `/parties`

- **Party**: **Party type** (R: PERSON/ORGANIZATION), **Display name** (R);
  **Name**, **Legal name**, **Client ID** (O, from Clients), **Notes** (O).
- **Relationship**: **From party ID** (R), **To party ID** (R),
  **Relationship type** (R, free text) — links two parties from the same page.
- **List**: search/status/type filters (O).

### 4.3 Conflict checks — `/conflict-checks`

Clearance workflow: PENDING → IN REVIEW → ALLOW/BLOCK.

1. **Request** a check: add ≥1 party row — **Kind** (R: PARTY/RELATED_ENTITY),
   **Name** (R), **Email** (O); **Client ID** (O, from Clients).
2. Copy the returned check **ID**; **Start review**.
3. **Decide**: Allow, or Block with a **Reason**.
- **List**: filter by status (O).

### 4.4 Intake — `/intake`

- **Submit**: **Full name** (R), **Client type** (R: INDIVIDUAL/ORGANIZATION),
  **Matter summary** (R) → returns a request ID. **Load** lists requests.
- **Triage**: paste the **Request ID** (R) → **Review** moves it to
  IN REVIEW → **Approve** creates the client (returns the new client ID for
  use in Clients/Cases) or **Reject** with a **Reason** (R for reject).
- No inbound prerequisite; approval feeds Clients/Cases.

## 5. Matters

### 5.1 Cases — `/cases`

The matter hub. Almost every other page needs a case ID from here.

- **Case**: **Case number** (R), **Client ID** (R, from Clients — create only);
  **Internal number**, **Practice area**, **Case type**, **Status**
  (OPEN/ON_HOLD/CLOSED), **Priority**, **Open/Close dates**, **Party IDs**
  (O, comma separated, create only). **ID** (R) for update.
- **List**: search by case number, status filter (O) + Prev/Next.
- **Details**: paste case **ID** → shows client + parties.
- **Parties**: add needs **Case ID** + **Party ID** (from Parties) + **Role ID**
  (from Roles); remove needs case + party IDs.
- **Timeline**: list needs **Case ID**; append needs **Case ID** + **Event
  type** (R) + **Payload** (O, JSON text).
- **Assignments**: **Case ID** (R) + **Membership ID** (R, from Members) to
  assign; list/unassign per row.
- **Break-glass** (emergency): **Member ID** + **Case ID** + **Reason** (all
  R); **Ends at** (O). Activate, list active grants, revoke per row.

### 5.2 Hearings — `/hearings`

- **Schedule**: **Case ID** (R, from Cases), **Date** (R); **Court** (O, from
  Legal config), **Time**, **Hearing type**, **Notes** (O).
- **Outcome**: pick a **Hearing** (R, scheduled ones), set **Status** (R),
  add **Outcome** text (O).
- **List**: optional case filter; read-only cards.

### 5.3 Deadlines — `/deadlines`

- **Schedule**: **Case ID** (R), **Title** (R), **Deadline type** (R:
  FIXED/RELATIVE/RULE_BASED/MANUAL/RECURRING), **Due date** (R);
  **Description** (O), **Rule ID** (O, from the Rules tab).
- **Rules**: **Name** (R), **Effective from** (R); **Description**,
  **Effective to** (O). The existing-rules list feeds the Schedule tab.
- **List**: optional case filter; read-only.

### 5.4 Tasks — `/tasks`

- **Create**: **Title** (R), **Priority** (R: LOW/MEDIUM/HIGH/CRITICAL);
  **Case ID** (O, from Cases), **Description**, **Due date**,
  **Parent task** (O, from the same page's list) (all O).
- **List**: optional case filter; per-row **Mark in progress / Complete**.

### 5.5 Documents — `/documents`

- **Create**: **Title** (R); **Case ID**, **Description**, **Document type**
  (O). Note: this registers metadata (storage details are system-filled).
- **List**: optional case filter; per-row **Mark final / Archive**.
- Prerequisite: a case ID from Cases for case-linked documents.

### 5.6 Secure links — `/secure-links`

Expiring signed URLs for a document (e.g. external review).

- Pick a **Document** (R, list is loaded from the Documents page data) and
  enter a **Purpose** (R).
- **Generate** shows the URL + expiry; **Copy** puts it on the clipboard.
- Prerequisite: the document must exist on `/documents`.

### 5.7 Workflows — `/workflows`

Self-contained: no outside prerequisite.

1. **Workflow**: **Name** (R); **Case type**, **Status** (O) → note the ID.
2. **Version**: pick the **Workflow** (R), add states (**Name** R, initial/
   final flags) and transitions (**To state** R, from state/conditions/
   actions/approval flag O) → **Create version**.
3. **Publish**: pick a DRAFT **Version** → **Publish**.
- **List/Refresh** shows IDs and latest version status.

## 6. Money

### 6.1 Billing — `/billing`

Chain matters: create fees/expenses → invoice them → record payments.

- **Fee**: **Kind** (R), **Description** (R), **Amount** (R); **Case/Client**
  (O). **Expense**: **Description** (R), **Amount** (R); **Case** (O).
- **Tax**: **Name** (R), **Rate** (R) → produces the tax rule ID used below.
- **Invoice**: **Invoice number** (R); **Case/Client** (O); **Discount**,
  **Tax rule**, **Due date**, **Time-entry / Fee / Expense IDs** (O, comma
  separated, from their tabs).
- **Lifecycle**: paste **Invoice ID** (R) → **Issue / Void / New version**.
- **Payment**: **Invoice ID** (R), **Amount** (R), **Idempotency key** (R —
  prevents double-charging on retry); **Provider ref** (O).
- **Credit**: create needs **Client ID** (R), **Amount** (R), **Case** (O);
  apply/refund need **Credit/Invoice/Payment IDs** + **Amount** (O) and a
  **Reason** (O, refund).
- **Ledger/Balance**: optional case/invoice filters + **Load** (read-only).
- Prerequisites: client IDs (Clients), case IDs (Cases), tax rule IDs (same
  page), and IDs returned by earlier tabs on this page.

## 7. Communication & coordination

### 7.1 Communications — `/communications`

- **Threads**: **Subject** (O), **Case/Client** (O) → **Create**.
- **Compose**: **Channel** (R), **Direction** (R), **Body** (R);
  **Thread/Subject/Case/Client/Task** (O) → **Compose**.
- **Inbox/Delivery**: list with optional filters; **Record** delivery needs
  **Message ID** (R) + **Status** (R) + **Error** (O).
- **Attachments**: **Message ID** (R) + **Storage object ID** (R, from
  Documents) + **MIME type**, **File size** (R).
- **Consent**: **Client ID** (R) + **Channel** (R) + **Status** (R:
  OPT_IN/OPT_OUT) → **Save**.
- Prerequisites: case/client/task IDs; message/thread IDs from earlier tabs.

### 7.2 Calendar — `/calendar`

- **Connections**: **Provider** (R: GOOGLE/MICROSOFT), **Account ref** (R) →
  **Create**; enable/disable per connection ID.
- **Sync**: **Connection ID** (R, from Connections) + **Local type** (R:
  HEARING/DEADLINE/TASK) + **Local ID** (R, the hearing/deadline/task ID from
  those pages) → **Push** (to provider) / **Pull** (from provider).
- **Mappings/Agenda/Conflicts**: optional connection filter + **Load**;
  resolve a conflict with **Resolution** (R: LOCAL/REMOTE_WINS).
- Live provider calls are deferred by design: connections record intent.

### 7.3 Portal — `/portal` (read-only)

Client-facing view. No inputs: open a tab (cases, documents, agenda,
messages, invoices) and press **Load**. Shows only data linked to the signed-in
portal identity; that data is created on the internal pages above.

### 7.4 Notifications — `/notifications`

- **Inbox**: **Load**; **Mark read** per row.
- **Preferences**: **Channel** (R), **Enabled true/false** (R); quiet hours
  (O) → **Save**.
- **Rules**: **Event type** (R, e.g. INVOICE_ISSUED), **Channels** (R, comma
  separated), **Audience** (R); escalation hours + member (O) → **Create**.
- Prerequisites: events fire from billing/hearings/deadlines; escalation
  member IDs come from Members.

## 8. Data movement

### 8.1 Transfer (import/export) — `/transfer`

- **Import**: **Entity type** (R: CASE/CLIENT/PARTY/TASK), **Idempotency key**
  (R); **Content** (paste CSV) or **Storage object ID** (O, from Documents) →
  **Create** returns a job → **Validate** → **Approve** (or **Rollback**).
- **Jobs**: **Load** the list; open a **Job ID** for per-row **Errors**.
- **Export**: **Entity type** (R), **Max rows** (O), **Idempotency key** (R) →
  **Run**, then **Download CSV** with the job ID.
- The job ID chains the tabs: create → validate/approve → inspect/download.

## 9. Insight & automation

### 9.1 Reports — `/reports`

- **Definitions**: **Name** (R), **Data source** (R, e.g. CASE),
  **Columns** (R, comma separated) → **Create** returns a definition ID;
  **Load** lists them.
- **Run**: paste the **Definition ID** (R) → **Run** shows total + first 20
  rows. Results always respect your tenant and assignments.
- **Schedules**: **Definition ID** (R), **Frequency** (R: DAILY/WEEKLY),
  **Run at** (R, HH:MM) → **Create**; **Load** lists schedules.

### 9.2 Dashboard — `/dashboard` (read-only)

Firm overview. No inputs — press **Load**: KPIs (open cases, overdue
deadlines, open tasks, unpaid invoices, unread alerts), upcoming hearings and
deadlines, receivables by currency, recent activity. Prerequisite: data must
exist on the underlying pages.

### 9.3 AI assistance — `/ai`

- **Request**: **Task type** (R, e.g. CASE_BRIEF), **Refs** (R, comma
  separated `KIND:id` pairs such as `CASE:<id>` — refs are validated against
  your assignments); **Hint** (O) → **Create**. No provider is wired yet, so
  requests queue honestly with empty output.
- **Review**: paste **Request ID** (R) → **Load** the list, **Approve** only
  works once provider output exists (blocked server-side otherwise),
  **Reject** needs a **Reason**.

## 10. Governance

### 10.1 Compliance — `/compliance` (admin)

- **Audit**: optional **Event type** filter → **Search**; **Export** downloads
  `audit-export.csv` (capped, watermarked).
- **Retention**: **Target type** (R, default AUDIT_EVENT), **Retain years**
  (R, default 7) → **Save policy**; **Evaluate** shows eligible vs held
  counts per policy.
- **Holds**: **Name** (R) + **Reason** (R) → **Create** a tenant-wide hold;
  add **Target type** (O) + **Target ID** (O, e.g. a case ID from Cases) to
  scope it; **Release** needs the **Hold ID** + **Reason**; **Load** lists.
- No purge automation exists: evaluation reports only.

### 10.2 Integrations — `/integrations` (admin)

- **Connections**: **Load** health of all 8 provider keys; enter a **Key**
  (e.g. EMAIL) → **Enable/Disable**. Config holds non-secret settings only —
  secrets are rejected (they belong in Vault when wired).
- **Webhooks**: **URL** (https; http for localhost only) + **Events** (comma
  separated names from the Catalog tab) → **Register** returns a secret
  **shown once — copy it immediately, it is never shown again**; **Rotate**
  needs the **Webhook ID**; **Load** lists (hashes never exposed).
- **Catalog**: **Load** lists subscribable event names.

### 10.3 Operations — `/operations` (admin)

- **Status**: no inputs → **Load** shows live health (postgres/redis/queue/
  storage), outbox counts (yours vs global pool), policy presence, latest
  drill.
- **Policy**: **RPO/RTO hours**, **Schedule cron**, **Retention days** (all R,
  prefilled with 24/4/`0 2 * * *`/90) → **Save**.
- **Drills**: **Name** + **Target ref** (R) → **Start** returns a drill ID;
  enter it as **Drill ID** plus **Check name**/**Evidence** → **Finish passed**
  or **Finish failed** (a passed verdict with failing checks is rejected).
  Prerequisite: set the policy first (Status shows when it is missing).

## 11. Cross-page cheat sheet

| To do this | First create here | Then use here |
|---|---|---|
| Open a case | Client (`/clients`) | `/cases` (Case tab) |
| Attach a party to a case | Party (`/parties`) + Role (`/identity/roles`) | `/cases` (Parties tab) |
| Schedule a hearing in a court | Country→Jurisdiction→Court (`/legal-config`) | `/hearings` (Schedule) |
| Bill a matter | Case (`/cases`), tax rule (`/billing` Tax) | `/billing` (Invoice) |
| Record a payment | Invoice (`/billing`) | `/billing` (Payment, idempotency key R) |
| Message about a matter | Case/Client (`/cases`, `/clients`) | `/communications` (Compose) |
| Share a document externally | Document (`/documents`) | `/secure-links` (Generate) |
| Convert a prospect | — (submit directly) | `/intake` (Submit → Triage → Approve) |
| Run a report | Definition (`/reports`) | `/reports` (Run/Schedules) |
| Review AI output | Request (`/ai`) | `/ai` (Review) |
| Finish a drill | Drill (`/operations` Start) | `/operations` (Finish) |
| Give a user access | Role (`/identity/roles`) | `/identity/users` or invitations |

## 12. Settings & overview

- **Overview** (`/`, read-only landing): hero, metric cards, next-step card;
  **View health** links to `/integrations`. No inputs.
- **Settings** (`/settings`): press **English** or **Arabic** to switch the
  interface language and direction. No prerequisite.

## Appendix A. Worked examples — valid values for every input

Copy-ready realistic values. IDs below are well-formed UUIDs; replace them
with IDs your own pages return.

**Identity.** Users: email `sara.nasser@example.com`, username `sara.nasser`,
first/last `Sara`/`Nasser`, password `ChangeMe-2026-Secure!` (≥12 chars),
roleKeys `tenant.lawyer, tenant.paralegal`. Invitation: email
`omar.farouk@example.com`, roleKeys `tenant.lawyer`. Accept: token from the
invitation result. Members: membershipId `3fa85f64-5717-4562-b3fc-2c963f66afa6`,
reason `Left the firm`. Roles: key `tenant.paralegal`, name `Paralegal`,
permissionKeys `CanViewTenant, CanAccessAssignedCases`; assign needs a role ID
and membership ID (both UUIDs). Tenant switch: tenantId
`3fa85f64-5717-4562-b3fc-2c963f66afa6`. Bootstrap: the server-issued secret.

**Organization.** Organization: slug `cairo-hq`, name `Cairo HQ`. Branch:
organizationId `<org id>`, slug `alexandria-branch`, name `Alexandria Branch`.
Department: branchId `<branch id>`, slug `litigation`, name `Litigation`.
Team: slug `appeals-squad`, name `Appeals Squad`, description `Appeals team`.
Settings: key `working.days`, value `["Sun","Mon","Tue","Wed","Thu"]`.

**Legal config.** Country: code `EG`, name `Egypt` → jurisdiction:
countryId `<country id>`, name `Cairo General` → court: jurisdictionId
`<jurisdiction id>`, name `Cairo Commercial Court`, courtType `COMMERCIAL`,
department `Third Circuit` → location: courtId `<court id>`, name
`Main Building`, city `Cairo`, address `Corniche El Nil`.

**Clients.** Client: clientType `ORGANIZATION`, name `Al Noor Trading Co.`,
legalName `Al Noor Trading Company LLC`, source `referral`, notes `VIP`.
Contact: clientId `<client id>`, type `MOBILE`, value `+201012345678`, label
`Office`, isPrimary `true`. Address: type `REGISTERED`, line1 `Corniche El Nil,
Tower A, Floor 12`, city `Cairo`, country `EG`, postalCode `11511`.
List: search `Noor`, status `ACTIVE`.

**Parties.** Party: partyType `ORGANIZATION`, displayName `Al Noor Trading`,
clientId `<client id>`. Relationship: fromPartyId `<id A>`, toPartyId
`<id B>`, relationshipType `subsidiary of`.

**Conflict checks.** Request parties row: kind `PARTY`, name `Al Noor
Trading`, email `legal@alnoor.example.com`; clientId `<client id>` (optional).
Decide block: reason `Direct adverse interest in case C-2026-0143`.

**Intake.** Submit: fullName `Layla Haddad`, clientType `INDIVIDUAL`,
matterSummary `Contractor failed to deliver the villa by March; claiming
delay penalties.` → Triage: requestId `<request id>`; reject reason
`Outside practice areas`.

**Cases.** Create: caseNumber `C-2026-0143`, clientId `<client id>`,
internalNumber `INT-9921`, practiceArea `Commercial`, caseType `COMMERCIAL`,
status `OPEN`, priority `HIGH`, openDate `2026-09-01`, partyIds
`<party id 1>, <party id 2>`. Parties tab: caseId + partyId + roleId (e.g.
`claimant`). Timeline append: caseId, eventType `NOTE_ADDED`, payload
`{"note":"Client confirmed hearing date"}`. Assignments: caseId +
membershipId. Break-glass: member ID + case ID + reason `Urgent filing, assignee
on leave`, endsAt `2026-09-08T18:00`.

**Hearings.** Schedule: caseId `<case id>`, courtId `<court id>`, date
`2026-10-05`, time `09:30`, hearingType `First hearing`, notes `Bring original
contracts`. Outcome: hearingId `<id>`, status `POSTPONED`, outcome
`Rescheduled at defendant's request`.

**Deadlines.** Schedule: caseId, title `Submit statement of claim`,
deadlineType `FIXED`, dueDate `2026-09-30`, description `30-page limit`.
Rule: name `Appeal 30 days`, effectiveFrom `2026-01-01`, effectiveTo
`2026-12-31`.

**Tasks.** Create: title `Translate exhibit B`, priority `HIGH`, caseId
`<case id>`, description `Certified translation, 12 pages`, dueDate
`2026-09-20`, parentTaskId `<parent id>` (optional).

**Documents.** Create: title `Exhibit B — signed contract`, caseId `<case
id>`, description `Arabic original + translation`, documentType `CONTRACT`.

**Secure links.** documentId `<document id>` (pick from list), purpose
`EXTERNAL_REVIEW`.

**Workflows.** Workflow: name `Litigation standard`, caseType `CIVIL`, status
`ACTIVE`. Version: workflowId `<id>`; state `Filing` (initial ✓); state
`Judgment` (final ✓); transition toStateName `Judgment`, requiresApproval
checked. Publish: versionId `<draft id>`.

**Billing.** Fee: kind `HOURLY`, description `Hearing attendance 2h`, amount
`1500`, caseId `<id>`. Expense: description `Court fees`, amount `350`.
Tax: name `VAT 15%`, rate `15`. Invoice: invoiceNumber `INV-2026-0087`,
clientId `<id>`, caseId `<id>`, discountAmount `0`, taxRuleId `<tax id>`,
dueDate `2026-10-15`, feeIds `<fee id>`. Lifecycle: invoiceId + Issue.
Payment: invoiceId, amount `1725`, idempotencyKey
`pay-2026-0087-attempt-1`. Credit create: clientId, amount `500`; apply:
creditId + invoiceId + amount `500`.

**Communications.** Thread: subject `C-2026-0143 hearing prep`, caseId.
Compose: channel `EMAIL`, direction `OUTBOUND`, body `Reminder: hearing on
Oct 5 at 09:30.`, subject optional. Delivery record: messageId, status
`DELIVERED`. Attachment: messageId + storageObjectId `<id>` + mimeType
`application/pdf` + fileSize `1048576`. Consent: clientId + channel `SMS` +
status `OPT_IN`.

**Calendar.** Connection: provider `GOOGLE`, accountRef
`firm.calendar@gmail.com`. Sync: connectionId + localType `HEARING` + localId
`<hearing id>`. Conflicts: resolution `LOCAL_WINS`. Agenda: from
`2026-09-07`, to `2026-09-30`.

**Transfer.** Import: entityType `CLIENT`, idempotencyKey `imp-clients-001`,
content (CSV with headers `displayName,clientType` + rows). Jobs: jobId from
create → Validate → Approve. Export: entityType `CASE`, maxRows `500`,
idempotencyKey `exp-cases-001` → Run → Download.

**Notifications.** Preferences: channel `EMAIL`, enabled `true`, quietStart
`22:00`, quietEnd `07:00`. Rule: eventType `INVOICE_ISSUED`, channels
`EMAIL, IN_APP`, audience `ASSIGNEES`, escalationHours `24`.

**Reports.** Definition: name `Open cases by status`, dataSource `CASE`,
columns `caseNumber, status, priority`. Run: definitionId. Schedule:
definitionId + frequency `WEEKLY` + runAt `06:00`.

**AI.** Request: taskType `CASE_BRIEF`, refs `CASE:<case id>`, promptHint
`Focus on upcoming deadlines`. Review: requestId; reject reason `Wrong matter`.

**Compliance.** Audit search: eventType `intake.created`. Retention:
targetType `AUDIT_EVENT`, retainYears `7`. Hold: name `Matter X litigation`,
reason `Litigation anticipated`; scoped: targetType `CASE` + targetId
`<case id>`; release: holdId + reason `Matter closed`.

**Integrations.** Connection key `EMAIL` → Enable. Webhook: url
`https://example.com/hook`, events `case.created, invoice.issued` → copy the
one-time secret immediately. Rotate: webhookId.

**Operations.** Policy: rpoHours `24`, rtoHours `4`, scheduleCron
`0 2 * * *`, retentionDays `90` → Save. Drill: name `Q3 restore drill`,
targetRef `restore-branch-2026-q3` → Start → drillId + checkName `restore` +
evidence `Branch verified, 44 migrations applied` → Finish passed.


