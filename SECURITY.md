# Security & guardrails

Roommate Arbiter is designed with **no shadow IT** — every data flow is explicit, allowlisted, and user-controlled.

## What stays local

- Payment handles (Venmo, PayPal, Cash App, Zelle)
- Full app state in `localStorage` only
- Demo judge runs 100% offline — zero network calls

## What leaves your device (opt-in only)

| Destination | When | Data sent |
|---|---|---|
| `api.x.ai` | Live Grok mode + consent checkbox | Names, expenses, meals, balances — **never payment info** |
| `venmo.com` | You click Pay | Browser opens Venmo with pre-filled amount |
| `paypal.me` | You click Pay | Browser opens PayPal.me |
| `cash.app` | You click Pay | Browser opens Cash App |
| `doordash.com` | Restock Express — you click Order | Browser opens DoorDash search with item names |
| `ubereats.com` | Restock Express — you click Order | Browser opens Uber Eats search with item names |
| Google Fonts | Page load | Font files only |

## Guardrails enforced

- **Input sanitization** — strips HTML, control chars, enforces length limits
- **Payment handle validation** — strict regex per provider
- **Payment URL allowlist** — only `https://venmo.com`, `paypal.me`, `cash.app`
- **Delivery URL allowlist** — only `https://doordash.com`, `https://ubereats.com` (search deep links)
- **Grok payload filter** — payment data structurally excluded; schema validated server-side
- **Verdict sanitization** — blocks script injection in AI responses
- **Rate limiting** — 10 requests/minute per IP on `/api/judge`
- **CSP headers** — no inline scripts, no third-party connect except fonts
- **Static file allowlist** — server only serves known files
- **API key** — server-side only (`.env`), never exposed to browser

## No shadow IT means

- No analytics or tracking pixels
- No surprise third-party SDKs
- No background sync
- No payment credentials sent to AI
- User must explicitly consent before Grok receives data

See the in-app **Data & privacy** panel for the live summary.
