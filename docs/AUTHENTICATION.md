# Unified Authentication & Multi-Provider Social Identity Manual
**Campus Equipment Lending & Exchange Platform**
*Production Standard: Phase 13 Final — Google, GitHub, Facebook & LinkedIn Integration*

---

## 1. Unified Authentication Architecture
The platform utilizes **Firebase Authentication** as the single authoritative Identity Provider (IdP) across all authentication methods:
* Institutional Email / Password
* Google (`GoogleAuthProvider`)
* GitHub (`GithubAuthProvider`)
* Facebook (`FacebookAuthProvider`)
* LinkedIn (`OAuthProvider('linkedin.com')` via OpenID Connect)

Every provider exchange culminates in a verified Firebase ID token that is verified server-side by the Firebase Admin SDK before issuing an HTTP-only, secure Express session cookie.

```
 Client Browser
 (EJS Login / Register / Profile)
       │
       ├─► Google / GitHub / Facebook / LinkedIn OAuth Flow
       │   (Popup on Desktop, Redirect on Mobile)
       │
       ▼
 Firebase Authentication (Cloud IdP)
       │
       ▼
 Client Receives Signed Firebase ID Token
       │
       ▼
 POST /auth/session-login
       │
       ▼
 Express Server (Firebase Admin SDK)
 ├── 1. Cryptographically verifies ID token via auth.verifyIdToken(idToken)
 ├── 2. Extracts UID, verified email, display name, photo URL, provider ID
 ├── 3. Resolves or provisions Cloud Firestore profile (users/{uid})
 ├── 4. STRICT ZERO-TRUST: Role defaults strictly to 'student' (never senior/admin)
 ├── 5. Generates regenerated secure session cookie (session fixation defense)
 └── 6. Returns JSON redirect to requested dashboard
```

---

## 2. Identity Provider Setup & Callback Specifications

### 2.1 Google Sign-In
* **Provider Type**: Native Firebase Federated Provider (`GoogleAuthProvider`).
* **Scopes**: `email`, `profile`.
* **Firebase Console**: Authentication → Sign-in method → Enable Google.
* **Authorized Domains**:
  - `equipment.campus.edu` (Production custom domain)
  - `campus-equipment-exchange-prod.onrender.com` (Production web service)
  - `campus-equipment-exchange-staging.onrender.com` (Staging web service)
  - `localhost` (Development)

---

### 2.2 GitHub OAuth 2.0
* **Provider Type**: Native Firebase Federated Provider (`GithubAuthProvider`).
* **Scopes**: `user:email`.
* **GitHub Developer Portal Setup**:
  1. Go to **GitHub** → **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**.
  2. **Application name**: `Campus Equipment Lending Exchange`
  3. **Homepage URL**: `https://equipment.campus.edu`
  4. **Authorization callback URL**:
     ```
     https://campus-equipment-exchange-prod.firebaseapp.com/__/auth/handler
     ```
  5. Add generated **Client ID** and **Client Secret** into Firebase Console.

---

### 2.3 Facebook Login
* **Provider Type**: Native Firebase Federated Provider (`FacebookAuthProvider`).
* **Scopes**: `email`, `public_profile`.
* **Meta for Developers Setup**:
  1. Go to [developers.facebook.com](https://developers.facebook.com) → **My Apps** → **Create App** (Type: Consumer / Business).
  2. Add **Facebook Login** product.
  3. Under **Facebook Login** → **Settings** → **Valid OAuth Redirect URIs**, enter:
     ```
     https://campus-equipment-exchange-prod.firebaseapp.com/__/auth/handler
     ```
  4. Under **App Settings** → **Basic**, retrieve **App ID** and **App Secret**.
  5. Enter App ID and App Secret in **Firebase Console** → **Authentication** → **Sign-in method** → **Facebook**.
  6. **Security Mandate**: Never include the Facebook App Secret in frontend JavaScript or repository files.

---

### 2.4 LinkedIn OpenID Connect (OIDC)
* **Provider Type**: Firebase `OAuthProvider('linkedin.com')`.
* **Scopes**: `openid`, `profile`, `email` (strictly least privilege).
* **LinkedIn Developer Portal Setup**:
  1. Go to [LinkedIn Developers](https://www.linkedin.com/developers/) → **Create App**.
  2. Under the **Products** tab, request **Sign In with LinkedIn using OpenID Connect**.
  3. Under the **Auth** tab, retrieve the **Client ID** and **Client Secret**.
  4. Under **Authorized redirect URLs for your app**, configure:
     ```
     https://campus-equipment-exchange-prod.firebaseapp.com/__/auth/handler
     ```
  5. Save credentials in Firebase Console.

---

## 3. Account Takeover Defense & Linking Policy (Section 13)

### 3.1 Strict Anti-Takeover Mandate
The application **never automatically merges accounts** simply because an incoming social token shares an email with an existing account.

If an unlinked social login attempt is made with an email already belonging to an existing user:
```
Social Login Attempt
        ↓
Server inspects Firestore (users/{uid} vs users by email)
        ↓
Collision Detected (Email exists under different UID)
        ↓
REJECT with ACCOUNT_EXISTS_DIFFERENT_CREDENTIAL
        ↓
Prompt User: "This campus email is already registered with a different sign-in method.
Please sign in with your existing email and password first, then connect this social account from your Profile page."
```

### 3.2 Secure Profile Account Linking Flow
Once the student authenticates into their existing account:
1. Student navigates to `/users/profile`.
2. Under **Connected accounts**, student clicks **Connect** for the desired provider.
3. Client executes `auth.currentUser.linkWithPopup(provider)`.
4. Firebase Auth verifies ownership of both credentials and links the provider to the existing Firebase UID.
5. Client submits verified token to `POST /auth/link-account`.
6. Server appends the provider to the user's `linkedProviders` array in Firestore.
7. Subsequent logins with that social provider resolve directly to the existing account UID.

---

## 4. Account Disconnect Safety & Lockout Prevention (Section 15)
To prevent accidental user lockouts, `UserRepository.unlinkProvider` enforces:
```javascript
// Disconnect Guard
if (!hasPassword && existingProviders.length <= 1) {
  throw new Error('CANNOT_REMOVE_LAST_LOGIN: Cannot unlink your only sign-in method. Please set a password or connect another provider first.');
}
```
If a user registered exclusively through Google (no local password set) and tries to disconnect Google without first setting a password or connecting GitHub/Facebook/LinkedIn, the request is rejected with a descriptive error.

---

## 5. Security & Zero-Trust Checklist
- [x] **No Client Trust**: Client cannot submit `role`, `trustScore`, or `uid` directly; all identity metadata originates from the verified Firebase ID token.
- [x] **Default Role Strictness**: All new social registrations default strictly to `student`.
- [x] **Session Fixation Defense**: `req.session.regenerate()` is executed upon social token exchange.
- [x] **CSRF Protection**: Origin and Referer validation enforced on all auth endpoints.
- [x] **Image Safety**: Profile photo URLs from social providers are strictly sanitized (`https://` validation) to prevent script injection.
- [x] **Zero Secret Leakage**: Provider Client Secrets exist only inside the Firebase Authentication configuration; zero OAuth secrets in client-side code, Git, or logs.
