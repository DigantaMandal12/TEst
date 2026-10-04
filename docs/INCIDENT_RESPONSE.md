# Production Incident Response Guide
**Campus Equipment Lending & Exchange Platform**
*Standard Operating Procedure: SEV Classification, Triage & Incident Runbooks*

---

## 1. Incident Lifecycle & Response Framework
Every production incident follows a 7-stage operational lifecycle:

```
[1. DETECT]    Alert triggered via /health, Sentry, or user escalation
     │
[2. CONTAIN]   Mitigate immediate blast radius (traffic shedding, rollback, credential revocation)
     │
[3. INVESTIGATE] Identify root cause from sanitized JSON logs and operational metrics
     │
[4. RECOVER]   Restore service to healthy baseline (hotfix, rollback, failover)
     │
[5. VERIFY]    Execute production smoke tests and verify zero error rates
     │
[6. DOCUMENT]  Compile Post-Incident Review (PIR) with timeline and technical impact
     │
[7. PREVENT]   Implement regression tests and architectural guardrails
```

---

## 2. Severity Classifications & SLAs

| Severity | Definition | Target Ack | Target Resolution | Incident Commander |
|---|---|---|---|---|
| **SEV-1 (Critical)** | Complete platform outage, database unreachable, data loss, or active security exploit. | < 5 mins | < 30 mins | Lead Operations Engineer |
| **SEV-2 (High)** | Core workflow blocked (e.g., checkout/pickup confirmation failing, widespread login failures). | < 15 mins | < 2 hours | Backend Engineer on-call |
| **SEV-3 (Moderate)** | Non-critical service degraded (e.g., OpenRouter AI fallback active, image upload slow). | < 1 hour | < 8 hours | Duty Engineer |
| **SEV-4 (Low)** | Minor cosmetic or non-blocking edge-case issue. | Next business day | Next sprint | Development Team |

---

## 3. Dedicated Failure Runbooks

### Runbook 1: Application Down / Container Crash Loop (SEV-1)
1. **Detect**: Alert `ALT-01` fires (`/health` probe failing).
2. **Contain & Recover**:
   - Check Render Dashboard for recent deployment status or exit code.
   - If a recent deploy caused the crash: Execute **Instant Rollback** via Render Dashboard → **Deploys** → **Rollback to this deploy**.
   - If container ran out of memory: Trigger manual container restart and review memory logs.
3. **Verify**:
   - Run `curl https://equipment.campus.edu/health` to confirm HTTP 200.
   - Navigate to `/equipment` and verify catalog rendering.

### Runbook 2: Cloud Firestore Database Unavailable (SEV-1)
1. **Detect**: Rapid spike in HTTP 500 errors and `ALT-03` alert.
2. **Investigate**:
   - Check [Google Cloud Status Dashboard](https://status.cloud.google.com/) for Firestore service status in `asia-south1`.
   - Verify GCP project billing and API quota limits.
3. **Recover**:
   - If Firebase credentials expired: Rotate credentials using the Secret Rotation Plan.
   - If multi-region regional outage: Direct DNS failover to read-replica snapshot if configured.
4. **Verify**: Test read/write operations via `/health` and admin dashboard.

### Runbook 3: Authentication Failure / Login Outage (SEV-2)
1. **Detect**: Increased rate of failed student login attempts.
2. **Investigate**:
   - Check Firebase Authentication status.
   - Verify `SESSION_SECRET` and cookie attributes (`secure: true`, `sameSite: 'lax'`).
3. **Recover**:
   - If session cookie corrupted across clients: Rotate `SESSION_SECRET` to invalidate stale sessions cleanly.
   - Confirm Firebase Authorized Domains includes `equipment.campus.edu`.

### Runbook 4: Credential Compromise Runbook (SEV-1)
If an API key or private key is suspected leaked:
1. **OpenRouter Key Exposed**:
   - Immediately revoke key in OpenRouter dashboard.
   - The application automatically degrades to the Mode B local database-aware engine with zero user disruption.
   - Generate a replacement key and update Render Environment variables.
2. **Firebase Private Key Exposed**:
   - Immediately create a replacement Service Account Key in Google Cloud IAM.
   - Update `FIREBASE_PRIVATE_KEY` and `FIREBASE_CLIENT_EMAIL` in Render.
   - Revoke and delete the compromised key in Google Cloud Console.
   - Audit Cloud Firestore Audit Logs for unauthorized reads/writes during the window.
3. **Session Secret Exposed**:
   - Generate new 256-bit secret (`openssl rand -hex 32`).
   - Update `SESSION_SECRET` in Render. Existing user sessions will be terminated and must re-authenticate.

### Runbook 5: External AI Outage / OpenRouter Failure (SEV-3)
1. **Detect**: Alert `ALT-06` fires (fallback usage surge).
2. **Contain**: No manual intervention needed; `services/aiService.js` automatically routes queries to Mode B local deterministic engine.
3. **Investigate**:
   - Check OpenRouter credit balance and status page.
   - Verify network latency to `https://openrouter.ai`.
4. **Recover**: Once OpenRouter recovers, Mode A automatically resumes.

### Runbook 6: Cloud Storage Upload Outage (SEV-3)
1. **Detect**: Student equipment image uploads failing with HTTP 500.
2. **Investigate**: Check Firebase Storage bucket quota and security rule evaluations.
3. **Recover**: Re-deploy `storage.rules` via Firebase CLI: `firebase deploy --only storage`.

### Runbook 7: Data Corruption or Accidental Record Deletion (SEV-1/2)
1. **Detect**: Administrative escalation or user report of missing inventory.
2. **Contain**: Temporarily set application to maintenance mode if active corruption is occurring.
3. **Recover**:
   - Identify last known good daily snapshot in `gs://campus-equipment-exchange-prod-backups/`.
   - Restore affected collections to isolated staging project.
   - Export and surgically restore missing records to production using Firestore document write scripts.
4. **Verify**: Validate data foreign key integrity between `users`, `equipment`, and `borrowRequests`.

---

## 4. Post-Incident Review (PIR) Template
Within 24 hours of resolving any SEV-1 or SEV-2 incident, the Incident Commander must publish a PIR containing:
1. **Executive Summary**: Non-technical description of the incident and business impact.
2. **Timeline of Events (UTC)**: Detailed chronological log from initial trigger to resolution.
3. **Root Cause Analysis (5 Whys)**: Deep technical exploration of underlying architectural or procedural failures.
4. **Corrective & Preventive Action Items (CAPA)**: Concrete Jira/Linear issues assigned to engineers with due dates.
