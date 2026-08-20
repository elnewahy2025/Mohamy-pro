# Threat Model

## 1. Overview
This document outlines the specific threats to the Mohamy-pro platform and the required architectural mitigations. It must be updated when the architecture changes materially.

## 2. Trust Boundaries
1. **Public Internet -> API Gateway**: Untrusted input. Requires strict rate limiting, WAF, and input validation.
2. **API Gateway -> Application Layer**: Authenticated traffic. Requires token validation and tenant context extraction.
3. **Application Layer -> Database**: Trusted internal network. Requires parameterized queries (via Prisma) and Row-Level Security (RLS) based on the extracted tenant context.
4. **Application Layer -> External Providers (Integration Hub)**: Untrusted external networks. Requires secure credential storage, TLS, and webhook signature validation.

## 3. Threat Mitigations

| Threat Category | Specific Attack Vector | Required Mitigation |
| :--- | :--- | :--- |
| **Authentication Attacks** | Credential stuffing, brute force on login endpoint. | Rate limiting by IP and username. Mandatory MFA for staff roles. Account lockout after 5 failed attempts. |
| **Tenant Escape** | Malicious user manipulates `tenant_id` in API request payload. | The backend must **never** trust client-provided tenant IDs. The `tenant_id` must be securely derived from the validated JWT/session token on the server side. |
| **IDOR (Insecure Direct Object Reference)** | User guesses a sequential Case ID or Document ID belonging to another user. | Use UUIDv4 or NanoIDs for all externally facing IDs. Implement resource-level authorization checks (e.g., `CanViewCase(userId, caseId)`) before returning any data. |
| **Privilege Escalation** | Standard lawyer attempts to access admin settings endpoint. | Strict RBAC enforcement on all `/api/v1/admin/*` endpoints. |
| **File Upload / Malware** | User uploads a malicious PDF containing an exploit. | All uploaded files must be scanned via ClamAV before being moved to permanent S3 storage. Validate MIME types via magic numbers, not file extensions. |
| **Data Exfiltration** | Bulk downloading of client data via API scraping. | Implement strict pagination limits (e.g., max 100 items). Monitor and alert on anomalous data export volumes per user session. |
| **Webhook Attacks** | Attacker spoofs a payment success webhook from Stripe. | All incoming webhooks must have their cryptographic signatures validated against stored provider secrets. Implement replay protection using webhook event IDs. |
| **AI Prompt Injection** | User inputs malicious instructions into a case summary field to manipulate the AI Orchestrator. | Sanitize inputs before passing to LLMs. Use strict system prompts. **Crucially**, AI outputs must never automatically trigger state changes in the core domain without human review. |
