# LinkedIn Job Intelligence Extension

A Chrome extension that automatically identifies and ranks job opportunities from LinkedIn Jobs and Feed pages based on your profile.

## Architecture

```
Browser (Chrome Extension)
    ↓
Content Scripts (Extract jobs/posts from DOM)
    ↓
Local FastAPI Server (localhost:8000)
    ↓
Rule Engine → Matching Engine → Local LLM → Ranking
    ↓
SQLite Database
```

## Features

- **Dual Source Support**: Works on LinkedIn Jobs and Feed/Post pages
- **Smart Filtering**: Freshness, location, experience, role-based filtering
- **Semantic Matching**: Embeddings + local LLM for intelligent matching
- **Privacy-First**: All processing happens locally
- **Profile-Based**: Maintains structured user profiles with skills, experience, preferences

## Tech Stack

- **Extension**: Chrome Manifest V3, vanilla JavaScript
- **Backend**: Python 3.9+, FastAPI
- **Database**: SQLite
- **Embeddings**: sentence-transformers
- **LLM**: Ollama (local)
- **Vector Search**: FAISS

## Project Structure

```
LinkFinder/
├── extension/              # Chrome extension
│   ├── manifest.json
│   ├── background/
│   ├── content/
│   ├── popup/
│   └── options/
├── backend/                # Python FastAPI server
│   ├── api/
│   ├── core/
│   ├── models/
│   └── services/
├── database/               # SQLite schemas
└── docs/                   # Documentation
```

## Setup

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

### Extension Setup

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/` directory

### Ollama Setup

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull a small model
ollama pull phi3
```

## Usage

1. Set up your profile in the extension options
2. Open LinkedIn Jobs or Feed
3. Click the extension icon
4. Configure search parameters (freshness, location, etc.)
5. Click "Analyze Page"
6. View ranked results with match explanations

## Non-Negotiable Requirements

✅ Works on LinkedIn Jobs pages
✅ Works on LinkedIn Feed/Post pages  
✅ Freshness filtering (timestamp-based, not LLM)
✅ Structured user profile
✅ Semantic matching (not just keywords)
✅ Local-first processing
✅ Deduplication
✅ Dynamic content handling (MutationObserver)

## Development Roadmap

### V1 (MVP)
- Chrome extension with Jobs support
- Current page scanning
- Profile management
- Rule-based filtering
- Embedding matching
- Local LLM integration
- Basic ranking

### V2
- LinkedIn Posts support
- Post job classification
- Enhanced deduplication
- Match history
- Multiple profiles

### V3
- Continuous monitoring
- Scheduled scans
- Notifications
- Analytics dashboard

## License

MIT
