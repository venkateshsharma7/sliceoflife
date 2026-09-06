# Slice of Life AI

A clean local-first app replacing the original workbook tracker with:

- Daily habit check-in
- Score and rank tiers
- Screen-time and budget scoring
- Dashboard analytics
- Weekly review
- Reward protocol
- JSON import/export
- Gemini-powered AI coach through a local Node server

## Run

```powershell
cd C:\DeVeLoPeR\slice-life-ai-app
copy .env.example .env
npm.cmd start
```

Add your Gemini key to `.env`:

```text
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash
```

Then open:

```text
http://localhost:5173
```
