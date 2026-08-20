# API Specification

## 1. Base Version
- `/api/v1`

## 2. Standard Response Envelope
All successful API responses must be wrapped in the following JSON envelope:
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "req-12345",
    "timestamp": "2026-08-20T12:00:00Z",
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100
    }
  }
}
```

## 3. Standard Error Model
All error responses must use standard HTTP status codes and the following JSON envelope:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The provided input is invalid.",
    "details": [
      { "field": "email", "issue": "Must be a valid email address" }
    ]
  },
  "meta": {
    "requestId": "req-12345",
    "timestamp": "2026-08-20T12:00:00Z"
  }
}
```

## 4. Idempotency
All `POST`, `PUT`, and `PATCH` requests must include an `Idempotency-Key` header (UUIDv4). The server will cache the response for 24 hours. Subsequent requests with the same key will return the cached response without re-executing the logic.

## 5. Compatibility & Deprecation
- `/api/v1` is a stable contract.
- Breaking changes (removing fields, changing types, adding required parameters) require bumping the version to `/api/v2`.
- Deprecated endpoints must return a `Deprecation: true` header.
- Sunset policy: Deprecated endpoints will be supported for exactly 6 months from the date of deprecation before being removed.
