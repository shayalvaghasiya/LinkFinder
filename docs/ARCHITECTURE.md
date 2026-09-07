# Architecture Document

## System Overview

LinkFinder is a Chrome extension that intelligently matches LinkedIn job opportunities and posts with user profiles using local AI processing.

## Design Principles

1. **Local-First**: All processing happens on user's machine
2. **Privacy-Preserving**: No data leaves the local environment
3. **Deterministic Filtering First**: Use rule-based filters before expensive AI
4. **Semantic Understanding**: Embeddings + LLM for intelligent matching
5. **Explainable Results**: Users see why each match scored as it did

## Components

### 1. Chrome Extension (Frontend)

**Technology**: Manifest V3, Vanilla JavaScript

**Components**:
- **Popup**: Main UI for triggering scans and viewing results
- **Options Page**: Profile management
- **Content Scripts**: DOM extraction from LinkedIn pages
- **Background Service Worker**: Message routing and state management
- **Storage**: Chrome local storage for configuration

**Key Files**:
- `manifest.json`: Extension configuration
- `popup/app.js`: Main UI logic
- `content/linkedin-jobs.js`: Job extraction
- `content/linkedin-feed.js`: Post extraction
- `options/profile.js`: Profile management

### 2. Backend API (Python/FastAPI)

**Technology**: FastAPI, SQLAlchemy, sentence-transformers

**Endpoints**:
- `POST /api/v1/process`: Main processing endpoint
- `GET/POST/PUT/DELETE /api/v1/profiles`: Profile management
- `GET /api/v1/health`: Health check

**Key Services**:

#### FilterEngine
- Freshness filtering (timestamp-based)
- Location matching
- Experience requirement matching
- Role filtering
- Employment type filtering

#### MatchingEngine
- Profile embedding computation
- Opportunity embedding computation
- Semantic similarity calculation
- Keyword-based baseline matching

#### RankingEngine
- Multi-signal scoring
- Configurable weights
- Score breakdown generation

#### LLMService
- Local LLM integration (Ollama)
- Match analysis generation
- Post classification

#### Orchestrator
- Main processing pipeline
- Coordinates all services
- Manages database transactions

### 3. Database (SQLite)

**Tables**:

```sql
profiles
  - id, name, profile_data (JSON), timestamps

opportunities
  - id, linkedin_id, fingerprint (UNIQUE)
  - source, type, title, company, location, url
  - posted_at, description, skills (JSON)
  - experience_min/max, employment_type
  - timestamps

matches
  - id, opportunity_id, profile_id
  - final_score, component scores
  - embedding_similarity, llm_analysis (JSON)
  - timestamp

processing_runs
  - id, profile_id, statistics
  - search_config (JSON), stats (JSON)
  - timestamp
```

### 4. AI/ML Components

**Embedding Model**: `all-MiniLM-L6-v2`
- 384-dimensional embeddings
- Fast inference (~30ms per text)
- Good balance of speed and quality

**LLM**: Ollama (phi3 or similar)
- Local inference
- Structured JSON output
- Match analysis and post classification

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    1. EXTRACTION                             │
│                                                              │
│  LinkedIn Page → Content Script → Raw Jobs/Posts            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  2. NORMALIZATION                            │
│                                                              │
│  Parse timestamps → Parse experience → Generate fingerprints │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  3. DEDUPLICATION                            │
│                                                              │
│  Check fingerprint in DB → Skip if exists                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              4. DETERMINISTIC FILTERING                      │
│                                                              │
│  Freshness → Location → Experience → Role → Employment      │
│  (Fast, rule-based)                                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                5. EMBEDDING MATCHING                         │
│                                                              │
│  Compute embeddings → Cosine similarity → Top N             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   6. LLM ANALYSIS                            │
│                                                              │
│  Top N → Ollama → Detailed match analysis (JSON)           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    7. RANKING                                │
│                                                              │
│  Weighted scoring → Sort by final_score                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  8. STORAGE & RETURN                         │
│                                                              │
│  Save to DB → Return to extension → Display                 │
└─────────────────────────────────────────────────────────────┘
```

## Scoring Algorithm

### Component Scores (0-100)

1. **Role Score (25% weight)**
   - Exact role match: 100
   - Contains role keyword: 70-85
   - No match: 30

2. **Skill Score (30% weight)**
   - Weighted by proficiency level
   - Strong skills: 1.0x weight
   - Working skills: 0.7x weight
   - Familiar skills: 0.4x weight

3. **Experience Score (20% weight)**
   - Within range: 100
   - Close (±0.5 years): 90
   - Acceptable deviation: 70-85
   - Significantly off: 30-50

4. **Location Score (10% weight)**
   - Exact match: 100
   - Partial match: 90
   - No match: 20

5. **Freshness Score (10% weight)**
   - <1h: 100
   - <6h: 95
   - <12h: 90
   - <24h: 85
   - <3d: 75
   - <7d: 65

6. **Employment Score (5% weight)**
   - Has info: 100
   - No info: 50

### Final Score

```python
final_score = (
    role_score * 0.25 +
    skill_score * 0.30 +
    experience_score * 0.20 +
    location_score * 0.10 +
    freshness_score * 0.10 +
    employment_score * 0.05
)
```

## Performance Characteristics

### Typical Processing Times

For 50 opportunities:
1. Normalization: ~100ms
2. Deduplication: ~50ms
3. Filtering: ~20ms
4. Embedding (50 items): ~1.5s
5. LLM (top 10): ~20-30s
6. Ranking: ~10ms
7. Storage: ~100ms

**Total**: ~25-35 seconds

### Bottlenecks

1. **LLM inference**: Slowest component (2-3s per item)
   - Mitigated by processing only top N
   - Could be parallelized

2. **Embedding computation**: Second slowest (~30ms per item)
   - Fast enough for V1
   - Could use caching for repeated profiles

3. **Database writes**: Minimal impact with SQLite
   - Could become bottleneck with thousands of concurrent users
   - Not a concern for local-first architecture

## Security Considerations

1. **No Cloud Data**: Everything stays local
2. **CORS**: Backend only accepts from extension
3. **Input Validation**: Pydantic models validate all inputs
4. **SQL Injection**: Protected by SQLAlchemy ORM
5. **XSS**: Content scripts don't execute arbitrary code

## Scalability

### Current Limits (V1)
- ~100 jobs per scan
- ~100 posts per scan
- Single profile processing
- Sequential LLM calls

### Future Improvements (V2+)
- Parallel LLM calls
- Embedding cache
- Batch processing
- Multiple profiles
- Continuous monitoring

## Testing Strategy

1. **Unit Tests**: Core functions (normalization, filtering)
2. **Integration Tests**: End-to-end pipeline
3. **Manual Tests**: Extension on real LinkedIn pages
4. **Performance Tests**: Process 100 items benchmark

## Deployment

### Development
- Backend: `python main.py`
- Extension: Load unpacked
- Ollama: Local installation

### Production (Future)
- Docker container for backend
- Extension published to Chrome Web Store
- Automated updates

## Future Architecture Changes

### V2: Continuous Monitoring
- Background scanner service
- Notification system
- Historical tracking

### V3: Advanced Features
- Multi-profile support
- Application tracking
- Interview preparation
- Company insights

## Dependencies

**Backend**:
- FastAPI: Modern async web framework
- SQLAlchemy: ORM for database
- sentence-transformers: Embedding generation
- Pydantic: Data validation
- httpx: Async HTTP client for Ollama

**Extension**:
- Chrome APIs: Storage, tabs, scripting
- Vanilla JavaScript: No frameworks (lightweight)

**External**:
- Ollama: Local LLM inference
- LinkedIn: Data source (via DOM scraping)
