# Melek Abdelmaksoud — Portfolio

Bilingual French/English portfolio presenting IT studies, web development projects, professional experience, and an ongoing interest in intelligent applications.

**Production site:** https://portfolio.melekabdelmaksoud72.workers.dev/

## Features

- Responsive portfolio with French/English switching.
- Project showcase and CV viewer.
- Browser voice input/output where supported.
- Portfolio chat UI connected to a same-origin `/api/assistant` endpoint.
- API-backed project publishing and a separate Cloudflare Access-protected admin dashboard.
- No hosted LLM/API is used by the assistant.

## Assistant: evidence-only by design

The visitor-facing chat does **not** use the old browser-only retrieval engine or a pretrained model. It sends questions to the Worker API in `worker/`, which retrieves only facts explicitly approved in D1 and returns their reviewed French/English text verbatim. If no approved fact matches, it abstains instead of inventing an answer.

The knowledge-base draft contains 23 records (including all eight portfolio projects) with source selectors and Tunisian Arabic aliases. Every record starts unapproved. Project rows start hidden. Review and approve content in `/admin.html` after deploying the API and configuring Cloudflare Access.

This is a grounded portfolio assistant, **not a general ChatGPT-equivalent LLM**. The small Transformer experiment in `melek-ai/` is separate, randomly initialized, and has not been trained or deployed.

## Admin and API deployment

See [worker/README.md](worker/README.md) for D1 creation, migrations, Cloudflare Access configuration, API deployment, and admin usage.

Important: the API Worker and D1 database are source-controlled here but have not been provisioned or deployed. The live portfolio has not been modified. Configure a same-origin `/api/*` route to the API Worker (recommended), or set `window.PORTFOLIO_API_BASE` in `api-config.js` to the API Worker origin and configure CORS/Access accordingly.

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

