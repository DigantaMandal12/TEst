# Firebase Migration Audit & Strategy

**Project**: Campus Equipment Lending Exchange  
**Migration Phase**: Phase 4 — Transition to Firebase & Cloud Firestore  
**Status**: APPROVED & IN EXECUTION  

---

## 1. Migration Overview
This document specifies the systematic replacement of the MongoDB/Mongoose persistence and session layer with **Firebase Authentication**, **Cloud Firestore**, **Firebase Storage**, and **Firebase Functions**, establishing Firebase as the single source of truth for all production application data.

```
                          PREVIOUS ARCHITECTURE (Phase 3)
                   Node.js/Express  ──►  MongoDB Atlas (Mongoose)
                           │                    │
                           ▼                    ▼
                   connect-mongo           Local Documents

                          TARGET ARCHITECTURE (Phase 4)
                   Node.js/Express  ──►  Cloud Firestore (Firestore SDK)
                           │                    │
                           ▼                    ▼
                   Firebase Auth           Typed Collections
```

---

## 2. Dependency Replacement Mapping

| Category | MongoDB / Mongoose Component | Cloud Firestore / Firebase Replacement | Technical Justification |
|---|---|---|---|
| **Identity & Passwords** | `bcryptjs` + `models/User.js` password field | **Firebase Authentication** (`auth.createUser`, `auth.createSessionCookie`, `auth.verifySessionCookie`) | Offloads raw credential storage to Google identity infrastructure; cryptographically signs user sessions. |
| **Session Store** | `connect-mongo` (MongoDB sessions collection) | **Firebase Session Cookies** + In-Memory Session Cache | Uses verified Firebase session cookies (`__session` / `campus_sid`) or custom tokens with 7-day TTL. |
| **Database Connection** | `mongoose.connect(MONGODB_URI)` | **`firebase-admin/firestore`** (`admin.initializeApp()`) | Secure server-side credential initialization with TLS and automatic Google Cloud connection pooling. |
| **Primary Document Models** | `models/User.js` | Firestore Collection: `users/{uid}` | User profiles keyed by Firebase Auth UID. |
| | `models/Equipment.js` | Firestore Collection: `equipment/{id}` | Indexed by `category`, `status`, `department`. |
| | `models/BorrowRequest.js` | Firestore Collection: `borrowRequests/{id}` | Atomic slot collision reservations via Firestore transactions. |
| | `models/Review.js` | Firestore Collection: `reviews/{id}` | Relational pointers (`equipmentId`, `reviewerId`). |
| | `models/Notification.js` | Firestore Collection: `notifications/{id}` | Scoped to `userId`, filtered on `read: false`. |
| **Query Engine** | `Model.find({ category, status })` | `collection.where('category', '==', ...).where('status', '==', ...).get()` | Strict query constraints with composable indexes. |
| **Item Lookup** | `Model.findById(id)` | `docRef.get()` | O(1) document reads by key. |
| **Record Creation** | `Model.create({...})` | `collection.add({...})` or `docRef.set({...})` | Native Firestore document creation with server timestamps. |
| **Record Updates** | `Model.findByIdAndUpdate(id, data)` | `docRef.update(data)` | Atomic field-level patch semantics. |
| **Record Deletions** | `Model.findByIdAndDelete(id)` | `docRef.delete()` | Direct document removal. |
| **Document Counts** | `Model.countDocuments(filter)` | `collection.where(...).count().get()` | Firestore Aggregation Queries (cost-efficient, minimal read units). |
| **Transactions & Concurrency** | In-memory slot collision check | `db.runTransaction(async tx => ...)` | ACID transactional isolation preventing double-booking of identical pickup slots. |
| **File Storage** | Base64 strings / container local paths | **Firebase Storage** (`gs://bucket-name`) | Secure, ephemeral-safe object storage for equipment and inspection images. |
| **Trusted Logic** | Express controller handlers | **Firebase Functions / Express Server Layer** | Server-side trusted execution with Zero Trust security rules. |

---

## 3. Data Model Schema Mapping

### 3.1 Users (`users/{uid}`)
- **ID**: `uid` (matching Firebase Auth UID)
- **Fields**: `name` (String), `email` (String, unique), `role` (String: student, senior, admin), `department` (String), `collegeId` (String), `trustScore` (Number, 0-100), `trustTier` (String), `ratingAvg` (Number), `ratingCount` (Number), `totalBorrowed` (Number), `totalLent` (Number), `createdAt` (Timestamp), `updatedAt` (Timestamp).

### 3.2 Equipment (`equipment/{equipmentId}`)
- **ID**: Auto-generated string
- **Fields**: `title` (String), `category` (String: Mechanical, Civil, Electrical, Survey, Other), `department` (String), `description` (String), `specs` (Array of Strings), `condition` (String), `dailyFee` (Number), `deposit` (Number), `status` (String: available, reserved, borrowed, maintenance), `ownerId` (String), `ownerName` (String), `pickupLocation` (String), `serialNumber` (String), `tags` (Array of Strings), `image` (String, Storage URL), `minTrustScore` (Number), `maxBorrowDays` (Number), `createdAt` (Timestamp), `updatedAt` (Timestamp).

### 3.3 Borrow Requests (`borrowRequests/{orderId}`)
- **ID**: Auto-generated string or order number (`ORD-XXXXX`)
- **Fields**: `orderNumber` (String), `equipmentId` (String), `equipmentTitle` (String), `borrowerId` (String), `borrowerName` (String), `lenderId` (String), `pickupDate` (String: YYYY-MM-DD), `pickupDateStr` (String), `pickupSlotId` (String), `pickupTime` (String), `pickupLocation` (String), `returnDate` (String: YYYY-MM-DD), `purpose` (String), `status` (String: pending, approved, active, returned, declined, cancelled), `paymentStatus` (String), `depositAmount` (Number), `depositRefunded` (Boolean), `conditionAtReturn` (String), `createdAt` (Timestamp), `updatedAt` (Timestamp).

### 3.4 Reviews (`reviews/{reviewId}`)
- **ID**: Auto-generated string
- **Fields**: `equipmentId` (String), `borrowRequestId` (String), `reviewerId` (String), `reviewerName` (String), `revieweeId` (String), `rating` (Number, 1-5), `punctualityRating` (Number), `conditionRating` (Number), `comment` (String), `createdAt` (Timestamp).

### 3.5 Notifications (`notifications/{notificationId}`)
- **ID**: Auto-generated string
- **Fields**: `userId` (String), `title` (String), `message` (String), `link` (String), `read` (Boolean), `category` (String), `createdAt` (Timestamp).

---

## 4. Concurrency & Collision Prevention in Firestore
Double-booking prevention is enforced via Firestore transactions:
```javascript
await db.runTransaction(async (transaction) => {
  const existingQuery = db.collection('borrowRequests')
    .where('pickupDate', '==', pickupDate)
    .where('pickupSlotId', '==', pickupSlotId)
    .where('status', 'in', ['pending', 'approved', 'active']);
  
  const snapshot = await transaction.get(existingQuery);
  if (!snapshot.empty) {
    throw new Error('SLOT_OCCUPIED: Selected pickup slot was just booked.');
  }

  // Create new borrow reservation within the same atomic transaction
  transaction.set(newBorrowRef, requestData);
});
```

---

## 5. Security Rules Integration
Zero-trust security rules enforce that client requests cannot tamper with `trustScore`, elevate roles to `admin`, or forge approval statuses. Rules are saved in `firestore.rules` and `storage.rules`.
