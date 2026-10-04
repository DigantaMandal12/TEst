# Environment Configuration Reference

This document details all configuration parameters required to operate the Campus Equipment Lending Exchange across development, staging, and production environments.

---

## Variable Reference Table

| Variable | Required | Default (Dev) | Production Target | Description |
|---|---|---|---|---|
| `NODE_ENV` | Yes | `development` | `production` | Controls logging, error detail leakage, and security guards. |
| `PORT` | No | `3000` | Port assigned by host (e.g. `8080`) | HTTP server listening port. |
| `APP_URL` | Yes | `http://localhost:3000` | `https://campus-exchange.edu` | Canonical URL used for AI headers and email links. |
| `SESSION_SECRET` | Yes | *Hardcoded dev fallback* | 64-char hex string | Secret key used to sign HTTP session cookies. |
| `COOKIE_SECURE` | No | `false` | `true` | Enforces `Secure` flag on cookies (requires HTTPS). |
| `ALLOW_DEMO_LOGIN` | No | `true` | `false` | When true, enables auto-session fallback for local hackathon testing. |
| `MONGODB_URI` | Yes | In-Memory Store | `mongodb+srv://...` | MongoDB connection URI with read/write credentials. |
| `OPENROUTER_API_KEY` | Optional | `None` (Offline Assistant) | `sk-or-v1-...` | API key for high-intelligence OpenRouter LLM guidance. |
| `OPENROUTER_MODEL` | No | `meta-llama/llama-3.1-8b-instruct:free` | Production model identifier | LLM model targeted for assistant answers. |

---

## Environment Isolation Guidelines
1. **Never commit actual `.env` files**: All environment configuration files containing sensitive secrets must be placed in `.gitignore`.
2. **Secret Rotation**: Rotate `SESSION_SECRET` and `OPENROUTER_API_KEY` every 90 days or immediately if any team member leaves or credentials are compromised.
3. **Least Privilege**: The MongoDB user credentials should be scoped strictly to the `campus_lending` database without global cluster administrative privileges.
