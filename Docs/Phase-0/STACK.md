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
- RTL-first architecture

## Backend

- NestJS
- TypeScript
- REST API
- OpenAPI
- Zod or `class-validator` for request validation
- PostgreSQL
- Prisma ORM as the default data-access layer

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
- Permission-aware retrieval
- Human approval before AI output becomes an official record

