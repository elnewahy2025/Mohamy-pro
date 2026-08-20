# Provider Capability Matrix

## 1. Purpose
Track what each external provider can do, where it is allowed to run, and what limits apply. This matrix feeds the Integration Hub and deployment decisions.

## 2. Approved Providers

| Provider | Capability | Version | Region | Limits | Auth Method | Webhook Support | Data Retention | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **AWS S3** | Storage | v3 | us-east-1, eu-central-1 | 5TB per object | IAM Roles / Access Keys | Yes (EventBridge) | Configurable Lifecycle | **APPROVED** |
| **SendGrid** | Email | v3 | Global | 10k/day (Standard) | API Key | Yes | 30 days (Logs) | **APPROVED** |
| **Stripe** | Payment | 2023-10-16 | Global | $999,999 per tx | Secret Key | Yes | Indefinite | **APPROVED** |
| **OpenAI** | AI Orchestrator | gpt-4o | us-east-1 | 10k RPM, 1M TPM | API Key | No | Zero Data Retention (Enterprise) | **APPROVED** |
| **Microsoft Graph** | Calendar | v1.0 | Global | 10k requests / 10 min | OAuth 2.0 | Yes (Delta queries) | N/A | **APPROVED** |
| **Twilio** | SMS / WhatsApp | 2010-04-01 | Global | 100 MPS | Account SID / Auth Token | Yes | 13 months | **APPROVED** |
