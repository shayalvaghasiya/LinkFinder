# Architecture Document

## System Overview
LinkFinder is a **browser-only** Chrome extension that extracts and ranks relevant LinkedIn job opportunities.

### Local-first principles
1. **Local-first:** everything runs in the extension runtime
2. **Deterministic filtering first:** freshness + rule eligibility happens before any expensive ML
3. **Explainable results:** the UI shows a scored breakdown + structured summary

## Components

### 1) Chrome Extension (Frontend)
- **Popup:** main UI (Analyze Page / Start Self-Scan) + results rendering
- **Options Page:** profile management
- **Content scripts:** DOM extraction for Jobs + Feed/Post pages
- **Background service worker:** message routing + lightweight state/badge updates
- **Storage:**
  - `chrome.storage.local` for profile/settings
  - IndexedDB for dedup/fingerprint history

Key files:
- `extension/popup/app.js`
- `extension/options/profile.js`
- `extension/content/linkedin-jobs.js`
- `extension/content/linkedin-feed.js`

### 2) Browser Processing Pipeline (in-extension)
The pipeline runs via `extension/ml/pipeline.js`.

#### Pipeline stages
1. **Unify opportunities** (jobs + posts normalized into one internal shape)
2. **Deterministic filtering** (freshness → location → role → experience)
3. **Post classification** (job-vs-non-job posts)
4. **Deduplication** (IndexedDB fingerprint store)
5. **Semantic similarity** (embeddings when available; fallback similarity otherwise)
6. **Top-N reasoning** (JSON-parsed match explanation; falls back to heuristics if needed)
7. **Weighted ranking** across rule scores + semantic similarity
8. **Render** match cards in the popup

## Scoring algorithm
A weighted blend combines:
- **Role score**
- **Skill/semantic similarity score**
- **Experience score**
- **Location score**

The popup displays:
- final score
- role/skills/experience/location breakdown
- a short summary + missing skills (when available)

## Data flow
```
LinkedIn Page
  └─ Content Script (extract raw job cards / posts)
      └─ Popup → in-extension pipeline
          ├─ Normalize
          ├─ Deterministic filters
          ├─ Classify posts (job opportunities)
          ├─ Dedup (IndexedDB fingerprints)
          ├─ Embeddings similarity
          ├─ Top-N structured reasoning
          └─ Rank + render results
```

## Deployment
- Load `extension/` as an unpacked extension
- No backend server required

## Notes on model loading
- The extension is designed to work with **graceful fallbacks** when model scripts cannot be loaded due to extension CSP restrictions.
