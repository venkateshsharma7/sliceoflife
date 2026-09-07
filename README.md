# Slice of Life AI

A clean local-first app replacing the original workbook tracker with:

- Daily habit check-in
- Score and rank tiers
- Screen-time and budget scoring
- Dashboard analytics
- Weekly review
- Reward protocol
- JSON import/export
- Optional cross-device cloud save
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

Cloud save is optional. To enable it, add a MongoDB connection string:

```text
MONGODB_URI=mongodb+srv://username:password@cluster.example.mongodb.net/?retryWrites=true&w=majority
MONGODB_DATABASE=sliceoflife
```

Use the same 12+ character sync code on each device. The app stores only a SHA-256 hash of that code as the snapshot identifier; choose a unique passphrase and do not reuse a password.

Then open:

```text
http://localhost:5173
```
