# Quick Start

## 1) Load the extension
1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/` folder

## 2) Create your profile
1. Click the extension icon
2. Open **⚙️ Profile Settings**
3. Fill in:
   - Profile name
   - Years of experience
   - Target roles
   - Strong / Working / Familiar skills
   - Preferred locations
4. Click **💾 Save Profile**

## 3) Analyze a LinkedIn page
1. Open a LinkedIn page:
   - Jobs: `https://www.linkedin.com/jobs/search/`
   - Feed: `https://www.linkedin.com/feed/`
   - Direct post URLs: `https://www.linkedin.com/posts/...`
2. Click the extension icon
3. Choose one:
   - **Analyze Page** (process currently visible content)
   - **Start Self-Scan** (scroll-only bounded extraction)

## 4) Understand results
- Matches include a score and an explanation (role/skills/location/experience breakdown + a short summary)
- If something looks missing, try adjusting:
  - freshness window
  - role/skills
  - locations

## Troubleshooting
- **No results**
  - Make sure you are on a LinkedIn Jobs or Feed/Post URL
  - Freshness window may be too strict for the content on the page
  - Extraction can vary by LinkedIn layout; check DevTools console logs for `[LinkFinder]` messages

- **Errors in popup**
  - Open **Inspect popup** and check the console

See `SETUP.md` for deeper configuration notes.
