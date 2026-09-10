# LinkFinder - Setup Guide

## Prerequisites
- Chrome browser

> LinkFinder is designed to be **browser-only**: you do **not** need to run the Python/FastAPI backend.

## 1) Load the extension
1. Go to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `extension/`

## 2) Configure your profile
1. Click extension icon
2. Open **⚙️ Profile Settings**
3. Enter:
   - Roles
   - Skills (Strong / Working / Familiar)
   - Experience years
   - Locations
4. Save

## Usage
### Analyzing LinkedIn Jobs
1. Open `https://www.linkedin.com/jobs/search/`
2. Click extension icon
3. Select:
   - Jobs and/or Posts
   - Freshness window
4. Click **Analyze Page** or **Start Self-Scan**

### Analyzing LinkedIn Posts
1. Open `https://www.linkedin.com/feed/` (or a `linkedin.com/posts/...` URL)
2. Click extension icon
3. Select **Posts**
4. Click **Analyze Page** or **Start Self-Scan**

## Processing pipeline (browser-only)
1. **Extraction:** content scripts pull raw job cards / post containers
2. **Normalization:** timestamp + experience parsing, location normalization
3. **Deterministic filtering:** freshness → location → role → experience (before ML)
4. **Post classification:** posts are classified as job opportunities (then kept)
5. **Dedup:** IndexedDB fingerprint store prevents re-processing duplicates
6. **Embeddings similarity:** profile vs opportunity similarity
7. **Top-N reasoning:** JSON-parsed structured explanation
8. **Ranking:** weighted blend of rule scores + semantic similarity
9. **Rendering:** ranked results shown in the popup

## Model availability / fallbacks
- The extension includes **graceful fallbacks** so it still works even when embeddings/LLM model scripts can’t be loaded due to browser/extension CSP.
- You’ll always get deterministic freshness + rule-based eligibility; ML reasoning may be reduced when model scripts aren’t available.

## Debugging checklist
- Open the LinkedIn page first, then click Analyze/Scan
- Open DevTools and search for `[LinkFinder]` logs
- If you consistently see extraction returning 0 items, try a different LinkedIn layout (e.g., a standard Jobs search page)

## Privacy
- Profile and computed match data stay on your machine (extension local storage)
- No backend server required

## Limitations
- Extraction depends on LinkedIn DOM structure
- Timestamp parsing depends on the posted time format LinkedIn displays
- Self-scan is **scroll-only** and stops after bounded limits
