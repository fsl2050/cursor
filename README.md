# Roommate Arbiter ⚖️

**Splitwise meets Grok.** Roommates log what they spent and what they ate. The Arbiter — powered by Grok — delivers unbiased, witty judgments on who owes whom.

Built for the Cursor hackathon, Aug 15 2026.

## Features

- **Add roommates** — the defendants enter the court
- **Log expenses** — who paid, how much, for what
- **Log meals** — who ate what, how much of it, linked to a purchase or general pool
- **Payment links** — connect Venmo, PayPal, Cash App, or Zelle per roommate
- **Check-in** — select who you are; get one-click pay links for what you owe
- **Demo mode** — works offline with built-in witty rulings (no API key needed)
- **Live Grok mode** — real xAI Grok judgments via server API
- **Restock Express** — log missing pantry items, auto-detect culprits from meal logs, launch DoorDash/Uber Eats to reorder, then split the bill and charge culprits via Venmo/PayPal/Cash App/Zelle
- **CraveBot sidebar** — mood-based group food chat: roommates check in their presence, set vibes, vote on suggestions, and place a group DoorDash/Uber Eats order split among everyone present

## Quick start (recommended — Windows)

**Double-click `start.bat`** in the project folder.

Or in PowerShell:

```powershell
cd C:\Users\fsl20\cursor
.\start.ps1
```

Opens **http://localhost:3001** automatically. No Node install needed.

For **Live Grok**, add your xAI key to `.env`:

```
XAI_API_KEY=your_key_here
```

Get a key at [console.x.ai](https://console.x.ai/).

---

## Alternative: open demo only (no server)

Double-click `index.html` — demo judge works offline. Live Grok needs the server above.

---

## Alternative: Node server

```bash
npm start
```

## Deploy to Vercel

```bash
vercel
# Set XAI_API_KEY in Vercel project env vars
```

## How the math works

- Expenses **without** linked meals → split equally among all roommates
- Expenses **with** linked meals → split by consumption share (who ate what %)
- Unlinked meals → weighted micro-charge against eaters (demo fairness heuristic)

Grok doesn't recalculate — it **judges** the numbers and delivers the verdict.

## Security

See [SECURITY.md](./SECURITY.md) for guardrails, data flows, and no-shadow-IT policy.

## Stack

- Vanilla HTML / CSS / JS (no build step)
- Node HTTP server for local Grok proxy
- xAI Grok API (`grok-4.3` by default — set `GROK_MODEL` in `.env`)

---

*Not legal advice. Grok's rulings are binding only in your kitchen.*
