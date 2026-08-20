# Observability Policy

## 1. Overview
This document defines the observability requirements for the platform, ensuring we can monitor health, debug issues, and audit security events without compromising data privacy.

## 2. Telemetry Requirements
- **Structured Logging**: All logs must be in JSON format.
- **Metrics**: Expose Prometheus metrics for HTTP request duration, database query duration, queue length, and error rates.
- **Tracing**: Use OpenTelemetry to trace requests across the API, Database, and Background Workers.
- **Correlation**: Every incoming request must be assigned a `correlation_id` (UUIDv4) that is passed to all downstream services, logs, and background jobs.

## 3. Log Types and Retention

| Log Type | Purpose | Tool | Retention Period |
| :--- | :--- | :--- | :--- |
| **Operational Logs** | Debugging application errors and tracing requests. | Loki | 30 Days |
| **Metrics** | Performance monitoring and alerting. | Prometheus | 90 Days |
| **Audit Logs** | Immutable record of business actions (e.g., Case closed, Document uploaded). | PostgreSQL (Audit Table) | 7 Years |
| **Security Logs** | Record of authentication attempts, permission changes, and access denials. | PostgreSQL / SIEM | 7 Years |

## 4. Privacy Rules
- **No Secrets**: Passwords, API keys, and JWT tokens must NEVER be logged.
- **No Confidential Data**: Full document contents, client financial details, and privileged communications must NEVER be logged. Only resource IDs and metadata (e.g., "Document uploaded: doc_123") may be logged in operational logs.
