# LinkFinder — LinkedIn Job Intelligence

## Project overview
LinkFinder is a **browser-only** Chrome extension that scans your currently open **LinkedIn Jobs** and **LinkedIn Feed/Post** pages, extracts job opportunities, then **filters + ranks** them against your saved profile — all local-first.

**Key behaviors**
- **Deterministic freshness filtering** before any ML work (no stale matches)
- **Local-first matching**: normalization + filtering + ranking in the browser
- **Embeddings + LLM-style reasoning** with structured explanations (with graceful fallbacks)
- **Explainable results** so you can decide what to open next
- **Deduplication** to avoid showing the same opportunity repeatedly

## Stack
- **Browser extension:** Chrome Manifest V3 + vanilla JavaScript
- **Extraction (content scripts):** DOM extraction on LinkedIn pages
- **Processing pipeline:** in-extension JS modules
  - Deterministic normalization & filtering
  - In-browser embeddings similarity
  - In-browser match explanation (JSON-parsed)
  - Deterministic weighted ranking
- **Dedup storage:** IndexedDB (opportunity fingerprints)
- **Profile/settings:** `chrome.storage.local`

## Quick start
See: [QUICKSTART.md](./QUICKSTART.md)

## Features
- **LinkedIn Jobs support** (title, company, location, URL, posted time when available)
- **LinkedIn Feed/Post support** with job-opportunity classification (filters out normal non-job posts)
- **Freshness filtering** using parsed LinkedIn timestamps
- **Profile-based matching** (roles, skills by proficiency, experience, locations)
- **Semantic similarity** (embeddings when available; fallback similarity otherwise)
- **Top-N reasoning** for match explanations and missing skills
- **Weighted ranking** across role/skills/experience/location/freshness
- **Deduplication** via fingerprinting across repeated scans
- **Bounded self-scan (scroll-only)** to capture more opportunities on-page
