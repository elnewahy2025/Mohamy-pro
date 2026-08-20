# Data Classification

## 1. Overview
Data classification determines authorization, storage, search, exports, AI processing, retention, sharing, and portal access.

## 2. Classification Levels & Entity Mapping

| Level | Description | Mapped Entities (Examples) | AI Processing Allowed? | Export Allowed? |
| :--- | :--- | :--- | :--- | :--- |
| **Public** | Data freely available to the public. | Public Court Information, Public Laws, Platform Marketing | Yes | Yes |
| **Internal** | Routine business operations data. | Employee Directory, Office Locations, Standard Task Types | Yes | Yes (Internal Only) |
| **Confidential** | Standard client and case data. | Client Names, Case Timelines, General Invoices | Yes (Opt-in only) | Yes (Tenant Admin Only) |
| **Highly Confidential** | Sensitive personal or financial data. | Client Bank Details, Medical Records, Settlement Amounts | **NO** | **NO** (Unless explicit break-glass) |
| **Privileged** | Attorney-client privileged communications. | Legal Strategy Notes, Draft Motions, Internal Counsel Comms | **NO** | **NO** |
| **Restricted** | Data restricted by law or court order. | Sealed Court Documents, Minors' Information | **NO** | **NO** |

## 3. Handling Rules
- **Logs**: Confidential, Highly Confidential, Privileged, and Restricted data must **never** be written to application logs.
- **AI Workflows**: Only Public, Internal, and explicitly opted-in Confidential data may be sent to external AI providers.
- **Search**: Search indexes must respect classification. Privileged and Restricted documents require explicit access grants beyond standard RBAC.
