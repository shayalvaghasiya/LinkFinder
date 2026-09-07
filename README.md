# LinkFinder — LinkedIn Job Intelligence

## Project overview
LinkFinder is a **Chrome extension + local backend** that scans your currently open **LinkedIn Jobs** pages and **LinkedIn Feed/Post** pages, extracts job opportunities, and then **filters + ranks** them against your saved profile.

Key behaviors:
- **Deterministic freshness filtering** (e.g., last 24 hours) before any AI work
- **Semantic matching** using embeddings + a local LLM
- **Explainable ranked results** so you can decide what to open next
- **Local-first**: profile and job data stay on your machine

## Stack
- **Browser extension:** Chrome Manifest V3 + vanilla JavaScript
- **Extraction (content scripts):** DOM extraction on LinkedIn pages
- **Backend API:** Python + FastAPI
- **Database:** SQLite (via SQLAlchemy)
- **Embeddings:** `sentence-transformers` (FAISS-capable setup)
- **Local LLM:** Ollama (e.g., `phi3`)

## Quick start
See: [QUICKSTART.md](./QUICKSTART.md)

## Features
- **LinkedIn Jobs support** (title, company, location, URL, posted time when available)
- **LinkedIn Feed/Post support** with job-opportunity classification (filters out normal non-job posts)
- **Freshness filtering** using parsed LinkedIn timestamps (mandatory)
- **Profile-based matching** (roles, skills by proficiency, experience, locations)
- **Semantic similarity** via embeddings (not just keyword matching)
- **Top-N local LLM analysis** for match explanation and missing skills
- **Weighted ranking** across role/skills/experience/location/freshness/employment
- **Deduplication** via fingerprinting (avoids repeated opportunities across scans)
