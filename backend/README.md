# LinkedIn Job Intelligence Backend

## Setup

1. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Install and setup Ollama:
```bash
# Install Ollama (visit https://ollama.ai for installation)
# Pull a small model
ollama pull phi3
```

4. Run the server:
```bash
python main.py
```

The API will be available at http://localhost:8000

## API Documentation

Interactive API docs: http://localhost:8000/docs

## Environment Variables

Create a `.env` file in the backend directory:

```env
API_HOST=localhost
API_PORT=8000
DATABASE_URL=sqlite:///./linkfinder.db
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=phi3
```

## Architecture

```
Backend Flow:
1. Receive raw jobs/posts from extension
2. Normalize data (timestamps, experience, etc.)
3. Deduplicate using fingerprints
4. Apply deterministic filters (freshness, location, experience)
5. Compute embedding similarities
6. Send top N to local LLM for analysis
7. Rank using weighted scoring
8. Store matches in database
9. Return ranked results
```

## Models

- **Embedding**: all-MiniLM-L6-v2 (384 dimensions, fast)
- **LLM**: phi3 via Ollama (small, local, fast)

## Database

SQLite with tables:
- `profiles` - User profiles
- `opportunities` - Jobs and posts
- `matches` - Match results with scores
- `processing_runs` - Processing metadata
