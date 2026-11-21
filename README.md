# Melek Abdelmaksoud — Portfolio

Bilingual French/English portfolio presenting IT studies, web development projects, professional experience, and an ongoing interest in intelligent applications.

**Production site:** https://portfolio.melekabdelmaksoud72.workers.dev/

## Features

- Responsive portfolio with French/English switching.
- Project showcase and CV viewer.
- Browser voice input/output where supported.
- Authenticated Melek AI workspace, available in a portfolio modal or full page, with private per-user chat history and model selection.
- API-backed project publishing and an admin dashboard (Cloudflare Access setup is still pending).
- Conversational AI powered server-side by Cloudflare Workers AI; provider keys and model configuration are never exposed in the browser.

## Assistant: evidence-only by design

The authenticated visitor workspace uses Workers AI for general conversation. When a question concerns Melek or her portfolio, the Worker retrieves only explicitly approved D1 facts and supplies them as grounding context. If relevant approved evidence is missing, the assistant must say so instead of inventing personal facts.

The knowledge-base draft contains 23 records in Arabic, French, and English (including all eight portfolio projects) with source selectors and Tunisian Arabic aliases. Every fact starts unapproved, so the assistant abstains until the owner reviews and approves reliable statements. The eight existing project cards are live; newly created projects default to hidden. The admin dashboard is deployed on the API Worker, but it becomes usable only after Cloudflare Access is configured.

The model catalogue currently offers Gemma 4 and Qwen 3.8 and can be extended server-side with `AI_MODELS_JSON`. The small Transformer experiment in `melek-ai/` is separate, randomly initialized, and has not been trained or deployed.

## Admin and API deployment

See [worker/README.md](worker/README.md) for D1 creation, migrations, Cloudflare Access configuration, API deployment, and admin usage.

The API Worker and D1 database have been provisioned and deployed. The production portfolio is live at the URL above, and the root `api-config.js` points to the deployed API Worker. The API Worker hosts its own admin dashboard at `/admin.html` so admin API calls stay same-origin; the root `/admin.html` redirects there. **Remaining setup:** configure Cloudflare Access for `/admin.html`, `/api/admin/*`, `/account.html`, `/api/models`, `/api/assistant`, and `/api/user/*`, then set the Worker secrets `ACCESS_ISSUER`, `ACCESS_AUD`, and `ADMIN_EMAIL`. Keep `/api/projects` and `/api/health` public. The API's `ALLOWED_ORIGIN` is set to the exact production portfolio origin.

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

