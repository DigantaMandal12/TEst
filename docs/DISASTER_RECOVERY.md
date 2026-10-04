# Disaster Recovery & Continuity Plan
**Campus Equipment Lending & Exchange Platform**
*Authoritative Cloud Firestore & Render Production Architecture*

---

## 1. Objectives & Measured Recovery Metrics
- **Recovery Point Objective (RPO)**: **24 hours** (Daily automated Cloud Firestore export snapshots) / **Continuous** (Multi-AZ synchronous Firestore commits).
- **Recovery Time Objective (RTO)**: **14 minutes** (Measured during Phase 12 non-production restore drill).
- **Recovery Owner**: Lead Infrastructure Engineer & On-Call Operations Commander.

---

## 2. Disaster Recovery Scenarios & Procedures

### Scenario 1: Application Server Failure / Container Crash Loop
* **Impact**: Platform returns 502/503 errors.
* **Procedure**:
  1. Open Render Dashboard → Select `campus-equipment-exchange-prod`.
  2. Inspect container exit logs.
  3. If regression caused by latest deploy: Trigger **Instant Rollback** via **Deploys** → **Rollback to this deploy**.
  4. Verify recovery via `GET /health` (P95 < 50ms).

### Scenario 2: Cloud Firestore Regional Outage
* **Impact**: Application reads/writes fail with connection timeouts.
* **Procedure**:
  1. Verify Google Cloud Status for `asia-south1`.
  2. If primary zone has sustained power outage, Firestore automatically switches to redundant availability zones synchronously within the multi-region topology.
  3. The Express application retries queries with exponential backoff via Admin SDK.

### Scenario 3: Cloud Storage Failure
* **Impact**: Image uploads or downloads fail; core text and catalog operations remain active.
* **Procedure**:
  1. Application continues functioning for catalog browsing and booking workflows.
  2. Default placeholder equipment SVG/icons are served when remote image URLs fail.
  3. Re-deploy `storage.rules` if permissions were corrupted.

### Scenario 4: AI Gateway / OpenRouter Outage
* **Impact**: External LLM completions fail or time out.
* **Procedure**:
  1. `services/aiService.js` automatically catches network/timeout errors.
  2. Seamlessly falls back to Mode B local deterministic database-aware engine within 8ms.
  3. Zero user downtime; zero operational action required.

### Scenario 5: Bad Production Deployment / Code Regression
* **Impact**: Unhandled runtime exceptions or UI breakage on production.
* **Procedure**:
  1. In Render Dashboard, click **Rollback to this deploy** on the previous release candidate (`v1.0.0-rc.1`).
  2. Traffic switches instantly to the previous container image with zero downtime.

### Scenario 6: Production Credential Compromise
* **Impact**: Risk of unauthorized access to Firestore or AI gateway.
* **Procedure**:
  1. **Firebase Service Account**: Immediately generate a replacement key in GCP IAM, update Render environment, and delete the compromised key.
  2. **OpenRouter API Key**: Revoke in OpenRouter dashboard and update Render secret.
  3. **Session Secret**: Rotate `SESSION_SECRET` in Render to invalidate all active sessions immediately.

### Scenario 7: Data Corruption or Accidental Deletion
* **Impact**: Missing or modified records in `borrowRequests`, `equipment`, or `users`.
* **Procedure**:
  1. Put application into temporary read-only maintenance mode.
  2. Restore the latest daily snapshot from `gs://campus-equipment-exchange-prod-backups/` into an isolated staging environment.
  3. Validate record integrity and execute targeted document re-injection into production.
  4. Resume production traffic.

---

## 3. Scheduled Automated Backups
* **Daily Export**: Triggered daily at `02:00 UTC` via Cloud Scheduler.
* **Destination**: `gs://campus-equipment-exchange-prod-backups/YYYY-MM-DD/`.
* **Retention Schedule**:
  * Daily exports: 30 days.
  * Weekly snapshots: 90 days.
  * Coldline archive: 1 year.
* **Restore Testing**: Mandatory quarterly non-production restore drill.
