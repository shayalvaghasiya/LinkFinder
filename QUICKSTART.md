# Quick Start

## 1. Start Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

Backend runs at http://localhost:8000

## 2. Start Ollama

```bash
ollama pull phi3
ollama serve  # Usually starts automatically
```

## 3. Load Extension

1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `extension/` folder

## 4. Create Profile

1. Click extension icon
2. Go to "⚙️ Profile Settings"
3. Fill in your details
4. Save

## 5. Test It

1. Open https://www.linkedin.com/jobs/search/
2. Click extension icon
3. Click "Analyze Page"
4. View results!

## Example Profile

```
Name: DevOps Engineer Profile
Experience: 1.5 years

Roles:
- DevOps Engineer
- Cloud Engineer
- SRE

Strong Skills:
- Python
- Docker
- Linux
- Jenkins

Working Skills:
- AWS
- Terraform
- Kubernetes

Locations:
- Ahmedabad
- Bangalore
- Remote
```

## Troubleshooting

**Backend won't start:**
- Check Python version: `python --version` (need 3.9+)
- Check port 8000 is free

**Extension not working:**
- Check backend is running: http://localhost:8000/api/v1/health
- Check browser console (F12) for errors

**No results:**
- Make sure you're on LinkedIn jobs or feed page
- Check that freshness filter matches job posting times
- Verify profile is saved

See SETUP.md for detailed instructions.
