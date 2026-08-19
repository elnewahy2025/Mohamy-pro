# Integration Contracts

Purpose:
- Define provider-neutral interfaces before implementation.

Contract rules:
- All integrations use ports/adapters.
- Each integration defines request, response, error, retry, and idempotency semantics.
- Provider capabilities are documented explicitly.
- Credentials are referenced, not exposed.

Required contract families:
- Email
- Calendar
- SMS
- WhatsApp
- Storage
- OCR
- Search
- Payment
- Accounting
- AI

