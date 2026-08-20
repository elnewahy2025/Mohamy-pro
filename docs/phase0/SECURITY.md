# Security

Security baseline:
- TLS everywhere.
- Secure password hashing.
- MFA support.
- Refresh token rotation.
- Rate limiting.
- CORS policy.
- CSRF protection where applicable.
- Security headers.
- Input and output validation.
- Secrets management.
- Audit logging.
- Security event logging.
- Encryption at rest where supported by the deployment stack.

Rules:
- No secrets in source control.
- No raw passwords or long-lived tokens in application storage.
- No security-sensitive action without audit coverage.

