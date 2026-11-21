# Melek Abdelmaksoud — Portfolio

Bilingual French/English portfolio presenting IT studies, web development projects, professional experience, and an ongoing interest in intelligent applications.

**Production site:** https://portfolio.melekabdelmaksoud72.workers.dev/

## Features

- Responsive portfolio with French/English switching.
- Project showcase and CV viewer.
- Browser voice input/output where supported.
- Portfolio chat UI connected to a same-origin `/api/assistant` endpoint.
- API-backed project publishing and an admin dashboard (Cloudflare Access setup is still pending).
- No hosted LLM/API is used by the assistant.

## Assistant: evidence-only by design

The visitor-facing chat uses the Worker API in `worker/`, the server-side D1 session, and Cloudflare Workers AI with approved-facts grounding. If no approved fact matches, it abstains instead of inventing an answer.

The knowledge-base draft contains 23 records in Arabic, French, and English (including all eight portfolio projects) with source selectors and Tunisian Arabic aliases. Every fact starts unapproved, so the assistant abstains until the owner reviews and approves reliable statements. The eight existing project cards are live; newly created projects default to hidden. The admin dashboard is deployed on the API Worker, but it becomes usable only after Cloudflare Access is configured.

This is a grounded portfolio assistant. The Workers AI provider is constrained to approved portfolio facts; the separate Transformer experiment in `melek-ai/` is not deployed.

## Admin and API deployment

See [worker/README.md](worker/README.md) for D1 creation, migrations, Cloudflare Access configuration, API deployment, and admin usage.

The API Worker and D1 database have been provisioned. The API Worker hosts `/account.html` and `/admin.html`. Cloudflare Access must protect only `/admin.html` and `/api/admin/*`; public visitor accounts use native email OTP and D1 sessions. Configure `ACCESS_ISSUER`, `ACCESS_AUD`, `ADMIN_EMAIL`, `RESEND_API_KEY`, `EMAIL_FROM`, `SESSION_PEPPER`, `OTP_PEPPER`, and, optionally, Turnstile variables. Keep `/api/assistant`, `/api/projects`, `/api/health`, and the authentication routes public or correctly CORS-protected.

## Security

- No admin password, role, or privileged session is trusted in browser storage.
- Legacy local login, registration, and password-reset methods are disabled.
- Admin API verifies Cloudflare Access JWT signature, issuer, audience, expiry, and the exact allowed email.
- Public assistant queries can read only approved facts; hidden projects are not returned.
- Never commit Access credentials, tokens, database secrets, or private visitor data.

## Repository layout

```text
index.html / style.css / script.js    Public portfolio and chat UI
admin.html / admin.css / admin.js     Access-protected content dashboard
api-config.js                         Same-origin API configuration
worker/src/index.js                   Cloudflare Worker API
worker/migrations/                    D1 schema and draft seed data
worker/README.md                      Deployment and security guide
melek-ai/                             From-scratch Transformer experiment
tests/                                Browser regression tests
```

## Local static preview

Open `index.html` directly for the static portfolio. The API-backed chat and project publishing require the Worker and D1 to be deployed; without them, the chat intentionally explains that the approved-information service is not connected and static project cards remain visible.

## Tests

- `npm test` — Playwright browser regression suite.
- `cd worker && node --test test/*.test.js` — Worker API unit tests.
- `cd melek-ai && python -m unittest discover -s . -p "test_*.py"` — evidence and knowledge validation tests.
- `cd melek-ai && python knowledge.py` — knowledge-base validation.

