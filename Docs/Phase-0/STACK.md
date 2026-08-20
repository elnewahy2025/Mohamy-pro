# Stack

This is the implementation stack frozen for Phase 0 and Phase 1.

## Frontend

- Next.js 16+
- React 19
- TypeScript
- Tailwind CSS
- shadcn/ui
- TanStack Query
- React Hook Form
- Zod
- `next-intl`
- App Router
- Server Components where useful
- Client Components where interaction requires them
- Generated TypeScript API client
- RTL-first architecture

## Backend

- NestJS
- TypeScript
- REST API
- OpenAPI
- Zod or `class-validator` for request validation
- PostgreSQL
- Prisma ORM as the default data-access layer
- Prisma Migrate as the migration system
- Expand/contract migration strategy

## Database

- PostgreSQL 18
- Redis
- PostgreSQL Row-Level Security where appropriate
- PostgreSQL full-text search initially
- `pgvector` for initial vector search where requirements justify it
- OpenSearch later if search scale requires it

## Storage

- S3-compatible object storage
- MinIO for self-hosted deployments
- AWS S3 for cloud deployments
- Storage access only through an abstraction layer
- SHA-256 integrity hashes for stored documents
- Signed URLs for controlled access
- Versioning for mutable documents
- Encryption at rest
- Retention and legal hold support
- Antivirus and malware scanning, starting with ClamAV

## Authentication

- Keycloak for self-hosted enterprise deployments
- Auth0 or Clerk only if a managed authentication path is explicitly selected
- OAuth 2.1 / OpenID Connect
- Short-lived access tokens
- Rotating refresh tokens
- MFA
- WebAuthn/passkeys where supported

## Background Jobs

- BullMQ
- Redis
- Dedicated worker processes
- Separate queues for documents, OCR, notifications, email, imports, exports, AI, search indexing, webhooks, and events

## Outbox and Messaging

- PostgreSQL transactional outbox
- Redis Streams initially or RabbitMQ later if messaging requirements justify it
- No Kafka during initial development; prefer PostgreSQL + Outbox + BullMQ

## Integration Hub

- TypeScript interfaces
- Adapter pattern
- Provider registry
- Webhook inbox
- Retry system
- Idempotency
- Dead-letter handling

## AI Layer

- Separate Python AI service
- AI Gateway in the core platform
- AI Orchestrator behind the gateway
- FastAPI for the Python service API
- Pydantic for request and response models
- `httpx` for outbound HTTP calls
- SQLAlchemy only where persistence is needed
- Optional LiteLLM for provider abstraction
- Optional LangGraph only for agent workflows that genuinely require it
- Do not make LangChain the foundation of the entire AI layer
- Permission-aware retrieval
- Human approval before AI output becomes an official record
- AI contracts defined by the platform, not by provider SDKs

## Observability

- OpenTelemetry
- Prometheus
- Grafana
- Loki
- Sentry
- Correlation IDs across request and job lifecycles

## Testing

- Vitest for frontend unit tests
- React Testing Library
- Playwright
- Jest for backend tests
- Supertest
- Testcontainers
- Contract tests for API compatibility
- Security tests for high-risk flows

## Security Tooling

- Semgrep or equivalent SAST
- DAST (Dynamic Application Security Testing)
- Trivy
- Gitleaks
- OWASP ZAP
- Dependency scanning
- SBOM generation

## CI/CD

- GitHub
- GitHub Actions
- Docker
- Docker Compose for development
- Pipeline order: commit, lint, type check, unit tests, integration tests, E2E, SAST, dependency scan, secret scan, container scan, build, deploy
- Kubernetes only when deployment scale justifies it

## Infrastructure

- Docker
- PostgreSQL
- Redis
- S3
- Reverse proxy/load balancer
- Secrets manager
- Monitoring
- Centralized logging
- Automated backups
- PostgreSQL backups with restore validation

## API

- REST
- OpenAPI
- `/api/v1`
- Generated TypeScript client for frontend
- Contract testing
- No GraphQL; REST is required for explicit business resource mapping

## Frontend Architecture

- Next.js App Router
- TanStack Query for server state
- Generated API client
- Zod for validation
- React Hook Form for forms
- English and Arabic support with full RTL/LTR behavior and locale-aware formatting
- Do not duplicate business rules in frontend code

## Architecture

- Modular monolith first
- Strong module boundaries
- TypeScript for the business platform
- Python only for AI/ML workloads
