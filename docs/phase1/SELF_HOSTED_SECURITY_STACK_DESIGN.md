# Phase 1 Zero-Cost Self-Hosted Security Stack Design

**Status:** Design phase; no containers or existing project services changed

## Decision

The no-paid-service route will not use the archived `minio/kes` Docker image or a static `MINIO_KMS_SECRET_KEY` as a production substitute. Official MinIO documentation now distinguishes deprecated open-source KES from the maintained, enterprise-licensed MinIO KES, and recommends MinIO KMS for new or long-term deployments [1]. The public `minio/kes` Docker repository is archived, so selecting its unpinned `latest` image would not satisfy the project’s production-readiness or supply-chain requirements [2].

The proposed self-hosted route is therefore:

```text
AIStor Free standalone object store (quay.io/minio/aistor/minio)
        │  TLS-protected KMS API
        ▼
MinIO KMS (quay.io/minio/aistor/minkms)
        │
        └── sealed root-key / key-management boundary

Mohamy API ── S3 API ── AIStor bucket with versioning + Object Lock
Mohamy API ── INSTREAM ── ClamAV clamd
```

The official MinIO pricing page describes a free standalone deployment for developers, researchers, enthusiasts, and small organizations [3]. The official AIStor container instructions use `quay.io/minio/aistor/minio` and require a license file for AIStor Server; the free tier permits a single compute resource [4]. Current MinIO KMS releases use `quay.io/minio/aistor/minkms`; the current KMS documentation states that new releases no longer require a commercial license, while the container procedure is documented for local development and evaluation [5]. The user’s `C:\Users\ahmed\Desktop\minio.license` is treated as a secret input for AIStor only; it must never be copied into Git or displayed.

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

The official MinIO guidance states that MinIO KMS requires TLS and recommends separating key-management hosts from encrypted object-store hosts [6]. The KMS container guide explicitly describes the single-node container procedure as local development/evaluation and directs production deployments to the Linux or Kubernetes procedures [5]. Therefore, Windows Docker can provide reproducible self-hosted runtime evidence, but a full production-readiness claim requires a supported Linux or Kubernetes host with persistent storage, backups, TLS, and operational recovery. The final report must not label a Windows-only Docker test as a production deployment.

## Current Blocker

The repository currently contains the legacy development `minio/minio` container on the primary Compose ports. It is intentionally not being modified for this work. Before implementation, the exact AIStor Free/KMS image and license distribution for the user’s architecture must be confirmed, then the isolated stack will be added as a separate Compose file or a separately named Compose project. No `docker compose down`, volume deletion, or replacement of the primary MinIO service is permitted.

## References

1. [MinIO Legacy Key Management: KES and MinIO KMS](https://docs.min.io/kms/legacy-key-management/)
2. [MinIO KES Docker repository](https://hub.docker.com/r/minio/kes)
3. [MinIO AIStor pricing](https://www.min.io/pricing)
4. [MinIO AIStor download and license access](https://www.min.io/download)
5. [MinIO KMS container installation and production boundary](https://docs.min.io/kms/installation/container/)
6. [MinIO KMS installation and TLS requirements](https://docs.min.io/kms/installation/)
7. [MinIO object-store Docker documentation](https://hub.docker.com/r/minio/minio)
8. [ClamAV official Docker documentation](https://docs.clamav.net/manual/Installing/Docker.html)
