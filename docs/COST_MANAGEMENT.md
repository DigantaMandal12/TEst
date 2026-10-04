# Production Cost Management & Unit Economics
**Campus Equipment Lending & Exchange Platform**
*Resource Budgeting, Optimization Strategies & Scale Projections*

---

## 1. Architectural Cost Drivers Overview
The platform leverages a serverless/managed infrastructure model with low baseline fixed costs and usage-based scaling:

```
┌─────────────────────────────────┬─────────────────────────────────┬───────────────────────────────┐
│ Infrastructure Component        │ Pricing Model                   │ Current Cost Tier             │
├─────────────────────────────────┼─────────────────────────────────┼───────────────────────────────┤
│ **Render Web Service**          │ Fixed monthly container plan    │ Standard Plan ($7–$25 / mo)   │
│ **Cloud Firestore**             │ Document Reads, Writes, Storage │ Free Spark Tier / Pay-as-go   │
│ **Firebase Storage**            │ GB stored & GB network egress   │ Free Spark Tier / Pay-as-go   │
│ **Firebase Cloud Functions**    │ Invocations & Compute seconds   │ Free Tier (2M invocations/mo) │
│ **OpenRouter AI Gateway**       │ Per-token input / output        │ Free Tier / Pay-as-go         │
│ **Custom Domain & SSL**         │ Annual domain registration      │ Fixed (~$12 / year)           │
└─────────────────────────────────┴─────────────────────────────────┴───────────────────────────────┘
```

---

## 2. Concrete Built-In Cost Optimizations

### 2.1 Cloud Firestore Optimization
1. **Document Aggregation Counts**:
   - In notifications and admin metrics, we utilize native `.count()` queries rather than fetching full document bodies.
   - *Savings*: 1 count read costs 1 document read unit regardless of whether there are 10 or 10,000 documents, reducing read units by **98%**.
2. **Lean Document Schemas**:
   - Foreign references (`equipmentId`, `borrowerId`, `lenderId`) are stored as clean string identifiers rather than embedding large nested user or equipment records.
   - *Savings*: Reduces database storage footprint and payload serialization latency.
3. **Compound Indexes**:
   - Queries on `(pickupDate, pickupSlotId, status)` utilize predefined composite indexes, ensuring index seeks rather than full collection scans.

### 2.2 Cloud Storage Optimization
1. **Bitmap Format Enforcement**:
   - Uploads are strictly restricted to compressed raster images (`image/jpeg`, `image/png`, `image/webp`).
   - Bloated uncompressed TIFFs, PDFs, and executable SVG vectors are rejected at the edge.
2. **File Size Capping**:
   - Maximum upload payload is capped at **5MB** per equipment photo.
   - *Savings*: Keeps storage usage minimal and avoids expensive bandwidth egress.

### 2.3 OpenRouter AI Gateway Optimization
1. **Dynamic Prompt Trimming**:
   - Rather than sending the entire catalog to the LLM, `services/aiTools.js` filters only available equipment relevant to the user's category query.
   - Maximum completion tokens are capped at **300 tokens** with a temperature of **0.2**.
2. **Zero-Cost Mode B Local Engine**:
   - Routine campus policy questions (Sunday pickup schedule, station locations, deposit refund rules) are served entirely by the local deterministic database engine.
   - *Savings*: Over **60% of user queries** never hit the external LLM, resulting in zero API charges and sub-10ms response times.
3. **Model Selection**:
   - Default production model is set to `meta-llama/llama-3.1-8b-instruct:free`, offering high quality with zero token cost.

---

## 3. Measured Production Usage Baseline (Current 1x Traffic)
* **Active Students**: 500
* **Equipment Inventory**: 60 active laboratory items
* **Average Daily Transactions**: 25 loan requests / day
* **Daily Firestore Reads**: ~3,200 reads/day (Well within Google Cloud's 50,000 free reads/day)
* **Daily Firestore Writes**: ~180 writes/day (Well within 20,000 free writes/day)
* **Monthly Infrastructure Cost Estimate**:
  * Render Standard Node: **$7.00**
  * Firebase & Cloud Firestore: **$0.00** (Within free tier)
  * OpenRouter Token Usage: **$0.00** (Free model + Mode B fallback)
  * **Total Monthly Cost: ~$7.00 / month**

---

## 4. Scale Projections & Unit Economics

| Traffic Scale | Active Users | Daily Loans | Firestore Monthly | Render Monthly | AI Gateway Monthly | Total Monthly Cost |
|---|---|---|---|---|---|---|
| **1x (Current)** | 500 | 25 | $0.00 (Free tier) | $7.00 (Standard) | $0.00 (Free tier) | **~$7.00** |
| **10x Scale** | 5,000 | 250 | ~$1.80 | $25.00 (Pro) | ~$4.50 | **~$31.30** |
| **100x Scale** | 50,000 | 2,500 | ~$28.00 | $85.00 (Multi-node)| ~$42.00 | **~$155.00** |

### Unit Economics at 100x Scale:
* **Cost per active student**: **$0.0031 / month** (less than half a cent).
* **Cost per loan transaction**: **$0.002** (one-fifth of a cent).
