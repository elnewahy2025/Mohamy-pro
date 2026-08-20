# Data Residency Policy

## 1. Overview
Data residency ensures that tenant data is stored and processed in legally compliant geographic locations. Each tenant deployment must specify its residency constraints.

## 2. Approved Regions
The platform currently supports deployment in the following regions:
- **KSA (Saudi Arabia)**: `me-south-1` (Primary for Middle East clients requiring local data sovereignty).
- **EU (Frankfurt)**: `eu-central-1` (GDPR compliant).
- **US (N. Virginia)**: `us-east-1` (General availability).

## 3. Residency Rules
- **Tenant Data Region**: All primary database records (PostgreSQL) and object storage (S3) for a given tenant must physically reside within their designated region.
- **Backup Region**: Backups must be stored in the same geopolitical boundary as the primary data (e.g., if primary is KSA, backups must remain in KSA).
- **Processing Region**: Background workers (BullMQ) and application servers (NestJS) must execute in the same region as the primary database.
- **AI Provider Region**: If external AI providers (e.g., OpenAI) are used, the API endpoint must route to the tenant's approved region. If a provider does not support the tenant's region, AI features must be disabled or routed to a compliant local model.
- **Data Transfer Policy**: Cross-region data transfer is strictly prohibited unless explicitly authorized by a "Break Glass" policy approved by the Tenant Admin and Platform Admin.
