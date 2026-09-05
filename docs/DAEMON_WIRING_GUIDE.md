# Daemon Wiring Guide — Phases 16–19 Scaffolds

**Date:** 2026-09-05
**Status:** All scaffold adapters fail closed (`*UnavailableError`). Wire each daemon below to bring its pipeline live. Order is by dependency: storage → malware → OCR → search → templates → KMS.

Conventions: Windows 11 + PowerShell + Docker Desktop. Backend reads config via Nest `ConfigService` (`backend/api/.env`, never committed). After each daemon, run the listed verification before moving on.

---

## 0. Shared prerequisites (PowerShell)

```powershell
docker --version
git checkout main; git pull origin main   # >= b0c37e51
cd backend\api
Copy-Item .env.example .env   # if missing; fill per daemon below
```

`REDIS_URL` (Upstash or local `redis/redis-stack-server`) must be reachable — BullMQ workers (`ocr.document`, search indexer) connect on boot.

---

## 1. Object storage / MinIO (required by OCR + documents)

Code: `src/infrastructure/storage/object-storage.service.ts` (S3-compatible, already real). Env it reads: `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_VERSIONING_ENABLED`, `S3_OBJECT_LOCK_ENABLED`, `S3_ENCRYPTION_MODE`, optional `S3_KMS_KEY_ID`.

```powershell
docker run -d --name minio -p 9000:9000 -p 9001:9001 `
  -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD='ChangeMe123!' `
  minio/minio server /data --console-address ":9001"
# create bucket + key in console http://localhost:9001, then .env:
# S3_ENDPOINT=http://localhost:9000 ; S3_BUCKET=mohamy-docs ; keys as created
```

Verify: `GET /api/v1/health/ready` → `objectStorage: up`.

---

## 2. ClamAV (malware gate)

Code: `src/infrastructure/storage/clamav-malware-scanner.service.ts` (real INSTREAM client). Env: `MALWARE_SCAN_ENABLED`, `CLAMAV_HOST`, `CLAMAV_PORT` (default 3310). The upload path scans via this service; the `documents/security` adapter stays fail-closed until explicitly pointed at it.

```powershell
docker run -d --name clamav -p 3310:3310 clamav/clamav:stable
# .env: MALWARE_SCAN_ENABLED=true ; CLAMAV_HOST=127.0.0.1 ; CLAMAV_PORT=3310
```

Verify: upload a document → `DocumentScan` row `CLEAN`; upload EICAR test file → `INFECTED` + quarantine path.

---

## 3. OCR source + PaddleOCR (Phase 17 live)

Two unwired points, both throwing `OcrUnavailableError` today:
1. `src/documents/ocr/ocr-worker.processor.ts` — replace the throw with a MinIO stream read (`GetObjectCommand`, bucket from §1) and call `processDocument(processingId, stream, tenantId)`.
2. `src/documents/ocr/adapters/paddle-ocr.adapter.ts` — replace the throw with an HTTP call to a PaddleOCR microservice:

```powershell
# example self-hosted PaddleOCR service (adjust image to your pinned build)
docker run -d --name paddleocr -p 8866:8866 paddleocr-service:latest
# .env (new, to add): OCR_SERVICE_URL=http://localhost:8866 ; OCR_SERVICE_TIMEOUT_MS=30000
```

Verify: enqueue processing for a PDF → `OcrPage` rows with real text; entities in `OcrEntity`; no `OcrUnavailableError` in logs. `pymupdf-text.extractor.ts` currently returns `[]` (forces OCR fallback) — point it at a `fitz` sidecar or keep as fallback-only, explicitly.

---

## 4. OpenSearch (Phase 18 live)

Code: `src/search/adapters/opensearch.adapter.ts` (all four methods throw `SearchUnavailableError`); workers enqueue via Redis (`search-indexer.worker.ts`, already wired to the provider).

```powershell
docker run -d --name opensearch -p 9200:9200 `
  -e discovery.type=single-node -e DISABLE_SECURITY_PLUGIN=true `
  opensearchproject/opensearch:2
# .env (new, to add): OPENSEARCH_URL=http://localhost:9200 ; SEARCH_INDEX_PREFIX=search
```

Code change: inject `@opensearch-project/opensearch` client, translate `SearchQuery`+`SearchAuthorizationContext` to DSL (keep the tenant filter — RLS equivalent at query time), implement `indexDocument`/`deleteDocument`. Verify: index a case → `GET /api/v1/search?q=` returns it; suggestions non-mock.

---

## 5. Templates: docxtemplater + LibreOffice (Phase 19 live)

Code: `src/templates/adapters/docx-template.renderer.ts`, `libreoffice-conversion.provider.ts` (both throw `RendererUnavailableError`).

```powershell
npm install docxtemplater pizzip   # run inside backend\api (adds deps via pnpm)
docker run -d --name libreoffice `
  -p 3004:3000 linuxserver/libreoffice:latest
# .env (new, to add): LIBREOFFICE_URL=http://localhost:3004
```

Code change: validate with PizZip tag parse; render with docxtemplater; convert via LibreOffice convert-to endpoint. Verify: render a template with `case.caseNumber` → real DOCX bytes (magic `PK\x03\x04`); convert → `%PDF` bytes. Specs assert the throw today — update them to fixture-based tests when wiring.

---

## 6. Vault Transit / KMS (Phase 16 live)

Code: `src/documents/security/adapters/vault.kms.ts` (both methods throw `KmsUnavailableError`; the old code fabricated unrecoverable ciphertext — deleted). The `KmsProvider` token is registered but nothing injects it yet, so nothing breaks.

```powershell
docker run -d --name vault -p 8200:8200 -e VAULT_DEV_ROOT_TOKEN_ID=dev-root vault:latest
# .env (new, to add): VAULT_ADDR=http://127.0.0.1:8200 ; VAULT_TOKEN=dev-root ; VAULT_TRANSIT_KEY=mohamy-document-key
```

Code change: implement `generateDataKey` via `POST /v1/transit/datakey/plaintext/:name` and `decryptDataKey` via `/v1/transit/decrypt/:name` (use `VAULT_TRANSIT_KEY`, not a hardcoded ring). Verify: encrypt→decrypt roundtrip returns identical bytes (the mock could never do this — assert it in a spec).

---

## Wiring order checklist

- [ ] §1 MinIO + `ready.objectStorage: up`
- [ ] §2 ClamAV + EICAR quarantine proof
- [ ] §3 OCR stream + PaddleOCR + real `OcrPage` rows
- [ ] §4 OpenSearch + real search results
- [ ] §5 docxtemplater + LibreOffice + magic-byte proofs
- [ ] §6 Vault roundtrip spec green
- [ ] Full E2E: upload → scan → OCR → search → timer → approve (manager role)

`tenant.manager` role + `CanApproveTimeEntries`/`CanPublishWorkflowVersions` are already in the catalog (`permission.constants.ts`); tenant admins assign the role via existing role-management endpoints, and startup reconcile grants the matrices.
