# Integration Hub

Purpose:
- Normalize all external service access behind adapters.

Supported categories:
- Email
- Calendar
- SMS
- WhatsApp
- Storage
- OCR
- Search
- Payments
- Accounting
- AI

Rules:
- Core modules never depend on provider SDKs.
- Tenant-specific integration configuration is required.
- Webhooks must be signed, idempotent, replay-protected, and auditable.

