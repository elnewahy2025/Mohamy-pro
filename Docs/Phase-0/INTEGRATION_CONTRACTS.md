# Integration Contracts

## 1. Purpose
Define provider-neutral interfaces before implementation. All integrations use ports/adapters. Core domain modules must depend on these interfaces, never on provider-specific SDKs (e.g., depend on `IEmailService`, not `SendGridClient`).

## 2. Core Principles
- **Idempotency**: All write operations to external providers must include an idempotency key.
- **Timeouts**: All external calls must have a strict timeout (e.g., 5000ms) to prevent cascading failures.
- **Retries**: Transient errors (HTTP 429, 502, 503, 504) should trigger a backoff retry mechanism via BullMQ.
- **Secrets**: Credentials are referenced by ID and fetched securely at runtime, never hardcoded or logged.

## 3. Contract Definitions

### 3.1. Email (`IEmailService`)
```typescript
interface SendEmailRequest {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  attachments?: { filename: string; url: string; mimeType: string }[];
  idempotencyKey: string;
}

interface SendEmailResponse {
  providerMessageId: string;
  status: 'QUEUED' | 'SENT' | 'FAILED';
  error?: string;
}
```

### 3.2. Storage (`IStorageService`)
```typescript
interface UploadFileRequest {
  bucket: string;
  key: string;
  buffer: Buffer;
  mimeType: string;
  metadata?: Record<string, string>;
}

interface GenerateSignedUrlRequest {
  bucket: string;
  key: string;
  expiresInSeconds: number;
}

interface GenerateSignedUrlResponse {
  url: string;
  expiresAt: Date;
}
```

### 3.3. Calendar (`ICalendarService`)
```typescript
interface CreateEventRequest {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  attendees: string[]; // emails
  location?: string;
  idempotencyKey: string;
}

interface CreateEventResponse {
  providerEventId: string;
  meetingLink?: string;
}
```

### 3.4. Payment (`IPaymentService`)
```typescript
interface CreateChargeRequest {
  amount: number; // Integer minor units (e.g., cents)
  currency: string; // ISO 4217 (e.g., 'USD', 'SAR')
  description: string;
  customerProviderId: string;
  idempotencyKey: string;
}

interface CreateChargeResponse {
  transactionId: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  paymentUrl?: string;
}
```
