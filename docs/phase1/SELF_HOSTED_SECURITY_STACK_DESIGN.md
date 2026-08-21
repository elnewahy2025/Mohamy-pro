# Phase 1 Zero-Cost Self-Hosted Security Stack Design

**Status:** Design phase; no containers or existing project services changed

## Decision

The no-paid-service route will not use the archived `minio/kes` Docker image or a static `MINIO_KMS_SECRET_KEY` as a production substitute. Official MinIO documentation now distinguishes deprecated open-source KES from the maintained, enterprise-licensed MinIO KES, and recommends MinIO KMS for new or long-term deployments [1]. The public `minio/kes` Docker repository is archived, so selecting its unpinned `latest` image would not satisfy the project’s production-readiness or supply-chain requirements [2].

The proposed self-hosted route is therefore:

```text
AIStor Free standalone object store
        │  TLS-protected KMS API
        ▼
MinIO KMS (free standalone license, if approved by the vendor license)
        │
        └── sealed root-key / key-management boundary

Mohamy API ── S3 API ── AIStor bucket with versioning + Object Lock
Mohamy API ── INSTREAM ── ClamAV clamd
```

The official MinIO pricing page describes a free standalone deployment for developers, researchers, enthusiasts, and small organizations [3]. The official download page lists MinIO KMS as an available add-on and provides the license-access path [4]. The deployment must still comply with the applicable license and must obtain the free license key if required; a free license is not the same as an unlicensed image.

## Why Vault/KES Is Not the Default

Vault OSS plus the deprecated open-source KES can be assembled without a cloud bill, but it is not the supported long-term MinIO path. The maintained MinIO KES fork requires an enterprise license, while the open-source KES project is deprecated [1]. Vault/KES remains a possible compatibility laboratory, not the chosen production baseline for this project.

## Isolation Requirements

The security stack must be separate from the existing Compose services and use isolated host ports and volumes. It must not reuse the primary `minio_data` volume or the primary development bucket.

| Component | Host boundary | Persistence | Required control |
|---|---:|---|---|
| AIStor/MinIO API | New isolated port, not `59000` | Dedicated object-store volumes | TLS, non-default credentials, versioning, Object Lock |
| AIStor/MinIO console | New isolated port, not `59001` | Same dedicated object-store volumes | Restricted administrative access |
| MinIO KMS | New isolated TLS port | Dedicated protected KMS volume | TLS, sealed root key, restricted API identity |
| ClamAV | New isolated host port mapped to container TCP `3310` | Dedicated signature database volume | `clamd` health and current signatures |

The existing PostgreSQL, Redis, primary MinIO, Health-ERP, and Vision-ERP containers remain untouched. The API and worker must be stopped before any environment or migration changes; Docker dependencies may remain running.

## Production-Readiness Requirements

A self-hosted deployment cannot be called production-ready merely because its containers start. The final evidence must include:

1. Free AIStor/KMS license or entitlement captured without exposing the secret license value.
2. TLS certificates and trust configuration for the KMS and object-store endpoints.
3. Dedicated persistent volumes and a tested backup/recovery procedure for the object store and KMS key material.
4. Object Lock enabled at bucket creation, versioning enabled, and non-default credentials.
5. KMS key creation and object encryption response verified through the actual S3 adapter.
6. ClamAV `clamd` reachable on TCP `3310`, clean scan completion before S3 write, and fail-closed behavior when the daemon is unavailable.
7. Retention and legal-hold deletion rejection verified against an isolated object version.
8. Cleanup of only the isolated verification resources.

The official MinIO guidance states that MinIO KMS requires TLS and recommends separating key-management hosts from encrypted object-store hosts [5]. The Windows Docker environment can provide a reproducible single-host self-hosted deployment for this phase, but the final report must distinguish **single-host self-hosted evidence** from a highly available multi-host deployment.

## Current Blocker

The repository currently contains the legacy development `minio/minio` container on the primary Compose ports. It is intentionally not being modified for this work. Before implementation, the exact AIStor Free/KMS image and license distribution for the user’s architecture must be confirmed, then the isolated stack will be added as a separate Compose file or a separately named Compose project. No `docker compose down`, volume deletion, or replacement of the primary MinIO service is permitted.

## References

1. [MinIO Legacy Key Management: KES and MinIO KMS](https://docs.min.io/kms/legacy-key-management/)
2. [MinIO KES Docker repository](https://hub.docker.com/r/minio/kes)
3. [MinIO AIStor pricing](https://www.min.io/pricing)
4. [MinIO AIStor download and license access](https://www.min.io/download)
5. [MinIO KMS installation and TLS requirements](https://docs.min.io/kms/installation/)
6. [MinIO object-store Docker documentation](https://hub.docker.com/r/minio/minio)
7. [ClamAV official Docker documentation](https://docs.clamav.net/manual/Installing/Docker.html)
