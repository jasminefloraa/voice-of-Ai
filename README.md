# Agentra AI – Voice Agent Studio

## Build. Speak. Automate.

An intelligent conversational AI platform powered by Sarvam AI, supporting personal loan settlement and car insurance renewal voice agents.

Agentra AI is an AI voice agent and conversational automation platform designed for clear, practical customer conversations.

## Product category
AI Voice Agent & Conversational Automation Platform

## Features
- Dark financial-services dashboard
- Personal Loan Settlement Voice Agent
- Car Insurance Renewal Voice Agent
- Live call studio with transcript and typed fallback
- Microphone capture and browser audio playback
- Sarvam AI speech-to-text and text-to-speech
- SQLite-backed session storage and analytics
- Demo mode that remains usable without Sarvam credentials
- Secure Sarvam environment variable setup

## Technology stack
- Frontend: React, TypeScript, Vite
- Backend: Python, FastAPI, Uvicorn
- Storage: SQLite
- Voice services: Sarvam AI STT and TTS

## Local setup

### Prerequisites
- Python 3.12+
- Node.js 20+
- npm

### Windows PowerShell

```powershell
cd "C:\Users\jasmi\OneDrive\Desktop\voice"
Copy-Item .env.example .env
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
cd frontend
npm install
cd ..
```

### Start backend

```powershell
cd "C:\Users\jasmi\OneDrive\Desktop\voice"
.\.venv\Scripts\Activate.ps1
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8001 --reload
```

### Start frontend

```powershell
cd "C:\Users\jasmi\OneDrive\Desktop\voice\frontend"
npm install
npm run dev -- --host 0.0.0.0
```

Open the frontend URL shown by Vite, typically:
- http://localhost:5173/

### Audio test
1. Open the app at http://localhost:5173/
2. Click “Start loan test” or “Start insurance test”
3. The app will request a live TTS audio response from the backend and play it automatically through the browser
4. If the backend is in demo mode because the key is missing, the app will still play a local fallback tone

## Configure Sarvam securely
1. Copy `.env.example` to `.env`
2. Set `SARVAM_API_KEY` to your real key
3. Keep `.env` local only; do not commit it
4. Restart the backend after changing the value
5. Use a compatible Bulbul speaker such as `kavya_hi_conversational` or `aayan_hi_conversational`; `anushka` and `manisha` are not valid for `bulbul:v4-flash`

## API documentation

With the backend running, open:
- Swagger UI: http://localhost:8001/docs
- OpenAPI schema: http://localhost:8001/openapi.json

## Start both together

Start the backend and frontend in separate terminals using the commands above. The frontend uses `http://localhost:5173/` and the backend uses `http://localhost:8001` by default.

## Notes
- Demo mode works without live credentials.
- Live audio verification requires a valid Sarvam account and a real browser test.
- This project intentionally labels demo/placeholder flows clearly.
