# Talus — Race Blueprint Engine

Precision race strategy for serious trail runners. Next.js + Vercel + Strava OAuth + Anthropic API.

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
Edit `.env.local`:
```
STRAVA_CLIENT_ID=your_strava_client_id
STRAVA_CLIENT_SECRET=your_strava_client_secret
NEXT_PUBLIC_BASE_URL=http://localhost:3000
ANTHROPIC_API_KEY=sk-ant-...your key here...
SESSION_SECRET=some-random-32-char-string-here-ok
```

### 3. Run locally
```bash
npm run dev
```
Open http://localhost:3000

### 4. Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Then in Vercel dashboard → Project Settings → Environment Variables, add all five variables from `.env.local`. Also update:
- `NEXT_PUBLIC_BASE_URL` → your Vercel URL (e.g. `https://talus.vercel.app`)
- In Strava API settings → change Authorization Callback Domain to your Vercel domain

### 5. Strava Callback URL
In https://www.strava.com/settings/api, set:
- **Authorization Callback Domain**: `localhost` (local) or `your-domain.vercel.app` (production)

The full redirect URI used is: `{NEXT_PUBLIC_BASE_URL}/api/auth/callback`

## Architecture

```
app/
├── page.tsx                     # Landing — Strava connect or demo mode
├── callback/page.tsx            # OAuth redirect handler
├── blueprint/page.tsx           # Main app — params → race → blueprint
└── api/
    ├── auth/strava/route.ts     # Initiates OAuth flow
    ├── auth/callback/route.ts   # Token exchange (server-side, secret stays safe)
    ├── blueprint/route.ts       # Streams Anthropic API response
    └── session/route.ts         # Returns current session info to client

lib/
├── strava.ts                    # Strava API client
├── blueprint-engine.ts          # Core race calculation logic
└── session.ts                   # iron-session cookie management
```

## Adding races
Edit `lib/blueprint-engine.ts` → `RACES` object. Add CPs with km, elev, gainFromStart and an elevation profile array.

## Roadmap
- [ ] Race Mode view (minimal on-course UI)
- [ ] Post-Race Autopsy (upload .fit file, find the collapse point)
- [ ] Offline PWA support
- [ ] COROS / Garmin Connect integration
