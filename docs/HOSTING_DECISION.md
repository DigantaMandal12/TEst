# Production Hosting Decision & Provider Evaluation

**Project**: Campus Equipment Lending Exchange  
**Decision Date**: October 2026  
**Status**: APPROVED — Primary Provider Selected  

---

## 1. Primary Recommendation: **Render (Web Service / Docker)**

**Selected Primary Host**: **Render (Docker Web Service)**  
**Alternative Secondary Options Evaluated**: Railway, Google Cloud Run, AWS App Runner.

---

## 2. Comprehensive Comparison Matrix

| Evaluation Criteria | Render (Selected) | Railway | Google Cloud Run | AWS App Runner |
|---|---|---|---|---|
| **Node.js / Express Compatibility** | Native (Docker / Node runtime) | Native (Docker / Node runtime) | Container-only | Container-only |
| **Process Model** | Persistent long-running process | Persistent long-running process | Request-driven (scales to zero by default) | Persistent or scaled container |
| **Background Timers & Rate Limiting** | Continuous event loop (`setInterval` runs smoothly) | Continuous event loop | Freezes timers between requests unless min-instances set | Continuous event loop |
| **HTTPS / TLS** | Automated zero-config Let's Encrypt | Automated zero-config TLS | Automated Google-managed TLS | Automated AWS ACM TLS |
| **Custom Domains & DNS** | CNAME / ALIAS with auto-renewal | CNAME with auto-renewal | Custom mapping via Cloud Load Balancing | Custom domain validation via DNS |
| **Environment Variables & Secrets** | Built-in encrypted env management | Built-in env management | Google Secret Manager integration | AWS SSM / Secrets Manager |
| **MongoDB Atlas Connectivity** | Clean outbound egress, works out-of-the-box | Outbound egress works | Requires VPC connector for static IPs | Requires VPC connector |
| **Health Check Integration** | Native path support (`/health`) | Native path support (`/health`) | Native HTTP health check probe | Native HTTP health check probe |
| **Deployment Simplicity** | Direct Git push / Dockerfile | Direct Git push | Requires GCP project, Artifact Registry, gcloud | Requires AWS IAM, ECR, CloudFormation/AppRunner |
| **Operational Cost** | Predictable ($7/mo Starter / Free tier available) | Usage-based ($5 credit, then metering) | Pay-per-request + min instance costs | ~$25+/mo baseline (vCPU/GB minimum) |

---

## 3. Why Render is the Selected Primary Platform

1. **Persistent Process Execution**: Render maintains a dedicated, continuously running container process. This ensures that:
   - In-memory rate limiting and token-bucket sliding windows remain active.
   - Background cleanup intervals (`setInterval`) run reliably without container freezing.
   - Database connection pools (`minPoolSize: 2`, `maxPoolSize: 20`) remain warm, eliminating cold-start latency.
2. **Operational Simplicity for Node/EJS**: Deploying the multi-stage Alpine Dockerfile on Render requires zero infrastructure boilerplate. Connecting the GitHub repository and specifying the `/health` endpoint enables immediate automated builds on `git push`.
3. **Seamless MongoDB Atlas & Egress**: Render allows standard outbound internet egress to MongoDB Atlas clusters over TLS (`mongodb+srv://`) without complex private VPC networking.
4. **Zero-Configuration HTTPS**: Every Render service receives an automatic `https://<service-name>.onrender.com` subdomain with free SSL/TLS certificates and automatic renewal. Custom domains are supported with one CNAME record.
5. **Dumb-Init Signal Handling**: The container's `ENTRYPOINT ["/usr/bin/dumb-init", "--"]` guarantees that Render's orchestrator `SIGTERM` signals reach the Node.js process directly, triggering the 10-second graceful connection draining sequence implemented in `server.js`.

---

## 4. Production Deployment Runbook for Render

1. **Create Web Service**:
   - In the Render Dashboard, select **New** → **Web Service**.
   - Connect the GitHub repository containing this codebase.
   - Choose **Docker** as the runtime (Render will automatically detect the `Dockerfile`).
2. **Configure Environment Variables**:
   - `NODE_ENV`: `production`
   - `PORT`: `3000` (Render will map this to port 80/443 externally)
   - `APP_URL`: `https://your-campus-exchange.onrender.com` (or your custom domain)
   - `MONGODB_URI`: `<your-production-mongodb-atlas-uri>`
   - `SESSION_SECRET`: `<64-character-random-hex-string>`
   - `COOKIE_SECURE`: `true`
   - `ALLOW_DEMO_LOGIN`: `false`
   - `OPENROUTER_API_KEY`: *(Optional — configure when external AI reasoning is desired)*
   - `OPENROUTER_MODEL`: `meta-llama/llama-3.1-8b-instruct:free`
3. **Configure Health Check**:
   - Set **Health Check Path** to `/health`.
4. **Deploy**:
   - Trigger build. Render executes the Dockerfile, runs `dumb-init`, confirms `/health` returns status `200`, and exposes the live HTTPS URL.
