# Cloud Firestore Data Architecture & Collection Specification

## 1. Overview
The Campus Equipment Lending Exchange has transitioned from MongoDB to **Cloud Firestore** as its single authoritative production database. The data architecture is structured around five core root collections optimized for query performance, atomic transactional reservations, and strict security rules.

```
                              CLOUD FIRESTORE (Production Database)
                                                │
         ┌──────────────────┬───────────────────┼──────────────────┬──────────────────┐
         ▼                  ▼                   ▼                  ▼                  ▼
    users/{uid}   equipment/{id}    borrowRequests/{id}   reviews/{id}   notifications/{id}
```

---

## 2. Collection Schemas & Data Model

### 2.1 Users Collection (`users/{uid}`)
Keyed by Firebase Authentication `uid`.
```json
{
  "uid": "usr_7f8a9b0c1d2e",
  "name": "Priya Sharma",
  "email": "priya.senior@campus.edu",
  "role": "senior",
  "department": "Mechanical",
  "collegeId": "ME-2023-018",
  "trustScore": 97,
  "trustTier": "Gold",
  "ratingAvg": 4.95,
  "ratingCount": 32,
  "totalBorrowed": 12,
  "totalLent": 18,
  "phone": "+91 98234 56781",
  "avatarUrl": "/images/default-avatar.svg",
  "createdAt": "2026-10-01T08:00:00.000Z",
  "updatedAt": "2026-10-03T10:00:00.000Z"
}
```
- **Ownership**: `request.auth.uid == userId`
- **Protected Fields**: `role`, `trustScore`, `trustTier` (server-only write via Cloud Functions/Admin).

### 2.2 Equipment Collection (`equipment/{id}`)
```json
{
  "id": "eq_48a129efb702",
  "title": "Omega Mini Drafter Pro 360°",
  "category": "Mechanical",
  "department": "Mechanical Engineering",
  "description": "Precision engineering drafting tool with stainless steel arms and unbreakable scale.",
  "specs": [
    "Scale: 300mm x 150mm clear acrylic",
    "Head: 360° protractor with locking screw",
    "Clamp: Universal steel table clamp with rubber padding"
  ],
  "condition": "Excellent",
  "dailyFee": 0,
  "deposit": 0,
  "status": "available",
  "ownerId": "usr_7f8a9b0c1d2e",
  "ownerName": "Priya Sharma (Senior Lender)",
  "pickupLocation": "Electrical Lab - Room 304",
  "serialNumber": "MD-2024-009",
  "tags": ["drafter", "drawing", "mechanical"],
  "image": "/images/placeholder.svg",
  "minTrustScore": 60,
  "maxBorrowDays": 7,
  "createdAt": "2026-10-01T08:00:00.000Z",
  "updatedAt": "2026-10-03T10:00:00.000Z"
}
```
- **Indexes**: Composite index on `category ASC, status ASC, createdAt DESC`.

### 2.3 Borrow Requests Collection (`borrowRequests/{id}`)
```json
{
  "id": "ORD-59224",
  "orderNumber": "ORD-59224",
  "equipmentId": "eq_48a129efb702",
  "equipmentTitle": "Omega Mini Drafter Pro 360°",
  "borrowerId": "usr_student_123",
  "borrowerName": "Rahul Das",
  "lenderId": "usr_7f8a9b0c1d2e",
  "requestDate": "2026-10-03T10:15:00.000Z",
  "pickupDate": "2026-10-15",
  "pickupDateStr": "15 October 2026",
  "pickupSlotId": "slot-1400-1430",
  "pickupTime": "2:00 PM – 2:30 PM",
  "pickupLocation": "Electrical Lab - Room 304",
  "returnDate": "2026-10-20",
  "actualReturnDate": null,
  "purpose": "Machine Drawing semester project",
  "status": "pending",
  "paymentStatus": "PAID",
  "depositAmount": 0,
  "depositRefunded": false,
  "conditionAtReturn": "",
  "createdAt": "2026-10-03T10:15:00.000Z",
  "updatedAt": "2026-10-03T10:15:00.000Z"
}
```
- **Concurrency Control**: Enforced using Firestore atomic transactions (`runTransaction`) verifying `pickupDate` and `pickupSlotId` availability before reservation commitment.

### 2.4 Reviews Collection (`reviews/{id}`)
```json
{
  "id": "rev_91823901",
  "equipmentId": "eq_48a129efb702",
  "borrowRequestId": "ORD-59224",
  "reviewerId": "usr_student_123",
  "reviewerName": "Rahul Das",
  "revieweeId": "usr_7f8a9b0c1d2e",
  "rating": 5,
  "punctualityRating": 5,
  "conditionRating": 5,
  "comment": "Tool was in flawless calibration. Saved my Machine Drawing lab!",
  "createdAt": "2026-10-03T10:20:00.000Z"
}
```

### 2.5 Notifications Collection (`notifications/{id}`)
```json
{
  "id": "notif_091823",
  "userId": "usr_student_123",
  "title": "🔔 YOUR PRODUCT IS READY",
  "message": "Order #ORD-59224 has been approved. Pickup at Electrical Lab.",
  "link": "/borrow/my-loans",
  "read": false,
  "category": "order",
  "createdAt": "2026-10-03T10:16:00.000Z"
}
```

---

## 3. Data Integrity & Query Optimization
1. **Count Aggregations**: Document count queries use `collection.where(...).count().get()` to minimize billed Firestore document read operations.
2. **Transaction Isolation**: Concurrency collisions on identical date/slot pairs are prevented at the database driver layer.
3. **Soft Cascade Updates**: Equipment state changes (`available` ↔ `reserved` ↔ `borrowed`) are updated atomically in the same transaction as borrow requests.
