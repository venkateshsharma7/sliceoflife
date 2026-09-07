# Slice of Life AI

A clean local-first app replacing the original workbook tracker with:

- Daily habit check-in
- Score and rank tiers
- Screen-time and budget scoring
- Dashboard analytics
- Weekly review
- Reward protocol
- JSON import/export
- Optional automatic cloud backup
- Gemini-powered AI coach through a local Node server

## Deployment

The React frontend is deployed to Netlify. Netlify forwards all `/api/*` requests to the Render backend, so the Gemini key and MongoDB URI remain server-side.

1. In Netlify, choose **Add new project**, import `venkateshsharma7/sliceoflife`, and deploy with the repository defaults. The included `netlify.toml` publishes this frontend and proxies API calls to Render.
2. Keep the Render web service connected to the same repository. It runs the Node API.
3. In Render Environment, add `MONGODB_URI` and paste your MongoDB connection string. `MONGODB_DATABASE` is already set to `sliceoflife`.

## Local Run

```powershell
cd path\to\sliceoflife
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

When MongoDB is connected, create an account to keep your tracker private. The app restores your account data at sign-in and saves changes shortly after every edit, on every device where you sign in.

For fresh AI-generated daily verdict portraits, optionally add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` to Render. The app uses Cloudflare Workers AI with `@cf/black-forest-labs/flux-1-schnell`; the Workers Free plan includes a daily allocation, so it is a free quota rather than unlimited generation.

Then open:

```text
http://localhost:5173
```
