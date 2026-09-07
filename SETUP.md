# LinkFinder - Setup Guide

## Prerequisites

- Python 3.9 or higher
- Chrome browser
- Ollama (for local LLM)

## Backend Setup

### 1. Install Python Dependencies

```bash
cd backend
python -m venv venv

# On Windows
venv\Scripts\activate

# On macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

### 2. Install and Setup Ollama

Visit https://ollama.ai and install Ollama for your platform.

Then pull a small model:

```bash
ollama pull phi3
```

Verify Ollama is running:
```bash
ollama list
```

### 3. Start the Backend Server

```bash
python main.py
```

The API will be available at http://localhost:8000

API documentation: http://localhost:8000/docs

## Chrome Extension Setup

### 1. Load the Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `extension/` directory from this project

### 2. Create Your Profile

1. Click the extension icon in Chrome toolbar
2. Click "⚙️ Profile Settings"
3. Fill in your profile:
   - Profile name
   - Years of experience
   - Target roles (DevOps Engineer, SRE, etc.)
   - Skills (categorized by proficiency)
   - Preferred locations
4. Click "Save Profile"

## Usage

### Analyzing LinkedIn Jobs

1. Open LinkedIn and navigate to a jobs search page:
   - https://www.linkedin.com/jobs/search/

2. Click the LinkFinder extension icon

3. Configure search:
   - Check "Jobs"
   - Select freshness filter (e.g., "Last 24 hours")

4. Click "Analyze Page"

5. View ranked results with match scores and explanations

### Analyzing LinkedIn Posts

1. Open LinkedIn feed:
   - https://www.linkedin.com/feed/

2. Click the LinkFinder extension icon

3. Configure search:
   - Check "Posts"
   - Select freshness filter

4. Click "Analyze Page"

5. The system will:
   - Extract posts
   - Classify which are job opportunities
   - Match against your profile
   - Show ranked results

## Architecture Overview

```
┌─────────────────┐
│  LinkedIn Page  │
└────────┬────────┘
         │ Extract
         ▼
┌─────────────────────┐
│  Content Scripts    │
│  - Jobs extractor   │
│  - Posts extractor  │
└────────┬────────────┘
         │ Send data
         ▼
┌─────────────────────┐
│  FastAPI Backend    │
│  localhost:8000     │
└────────┬────────────┘
         │
    ┌────┴────────────────┬─────────────┐
    ▼                     ▼             ▼
┌────────┐         ┌──────────┐   ┌─────────┐
│ Filter │────────▶│ Matching │──▶│ Ranking │
│ Engine │         │  Engine  │   │ Engine  │
└────────┘         └──────────┘   └─────────┘
                         │
                         ▼
                   ┌──────────┐
                   │ Local LLM│
                   │  (Ollama)│
                   └──────────┘
                         │
                         ▼
                   ┌──────────┐
                   │  SQLite  │
                   └──────────┘
```

## Processing Pipeline

1. **Extraction**: Content scripts extract jobs/posts from LinkedIn DOM
2. **Normalization**: Parse timestamps, experience requirements, locations
3. **Deduplication**: Use fingerprints to avoid processing duplicates
4. **Filtering**: Apply deterministic filters (freshness, location, experience, role)
5. **Embedding Matching**: Compute semantic similarity using sentence transformers
6. **LLM Analysis**: Top N candidates analyzed by local LLM for detailed matching
7. **Ranking**: Weighted scoring combining all signals
8. **Storage**: Matches saved to SQLite database
9. **Results**: Ranked opportunities displayed in extension

## Key Features Implemented

✅ **LinkedIn Jobs Support**: Extracts and analyzes job postings
✅ **LinkedIn Posts Support**: Identifies and analyzes job-related posts
✅ **Freshness Filtering**: Timestamp-based filtering (1h, 6h, 24h, 3d, 7d)
✅ **Profile-Based Matching**: Structured profiles with roles, skills, experience
✅ **Semantic Matching**: Embeddings + LLM (not just keywords)
✅ **Local-First**: All processing happens locally
✅ **Deduplication**: Fingerprint-based to avoid duplicates
✅ **Dynamic Content**: Works with LinkedIn's dynamically loaded content
✅ **Ranked Results**: Weighted scoring with explanations

## Configuration

### Backend Configuration

Edit `backend/.env`:

```env
API_HOST=localhost
API_PORT=8000
DATABASE_URL=sqlite:///./linkfinder.db
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=phi3
EMBEDDING_MODEL=all-MiniLM-L6-v2

# Processing limits
MAX_JOBS_PER_SCAN=100
MAX_POSTS_PER_SCAN=100

# Ranking weights
WEIGHT_ROLE=0.25
WEIGHT_SKILLS=0.30
WEIGHT_EXPERIENCE=0.20
WEIGHT_LOCATION=0.10
WEIGHT_FRESHNESS=0.10
WEIGHT_EMPLOYMENT=0.05
```

## Troubleshooting

### Backend won't start

**Check Python version:**
```bash
python --version  # Should be 3.9+
```

**Check if port 8000 is available:**
```bash
# Windows
netstat -ano | findstr :8000

# macOS/Linux
lsof -i :8000
```

### Ollama not working

**Check if Ollama is running:**
```bash
ollama list
```

**Test Ollama:**
```bash
ollama run phi3 "Hello"
```

### Extension not working

**Check console logs:**
1. Right-click extension icon → "Inspect popup"
2. Look for errors in console

**Check content script injection:**
1. Open LinkedIn page
2. Press F12 (Developer Tools)
3. Look for "[LinkFinder]" logs in console

### No results found

**Verify backend is running:**
- Open http://localhost:8000/api/v1/health
- Should return `{"status":"healthy"}`

**Check profile exists:**
- Open extension options
- Verify profile is saved

**Check LinkedIn selectors:**
- LinkedIn may update their DOM structure
- Content scripts may need selector updates

## Performance

- **Embedding model**: all-MiniLM-L6-v2 (384 dimensions, ~30ms per opportunity)
- **LLM**: phi3 (2.7B params, ~2-3 seconds per analysis)
- **Typical processing**: 50 jobs in ~15-30 seconds
- **Database**: SQLite (sufficient for thousands of opportunities)

## Privacy

- All data stays local on your machine
- No cloud services required
- Profile and match data stored in local SQLite database
- Extension only accesses currently open LinkedIn page

## Limitations

- LinkedIn selector changes may break extraction (requires updates)
- Posts classification depends on LLM accuracy
- Timestamp parsing relies on LinkedIn's display format
- No automatic scrolling (V1 - processes currently visible content)

## Roadmap

### V2 Features
- Continuous monitoring with scheduled scans
- Enhanced deduplication with match history
- Multiple profile support
- Export results to CSV/PDF
- Notification system

### V3 Features
- Application tracking
- Interview preparation
- Salary insights
- Company research integration

## Getting Help

For issues, check:
1. Backend logs in terminal
2. Browser console (F12)
3. Extension background service worker logs

## License

MIT
