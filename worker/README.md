# Portfolio API and admin dashboard

The API is a separate Cloudflare Worker named `melek-portfolio-api`. It is isolated from the existing `portfolio` production Worker.

## Current Cloudflare resource

- D1 database: `melek-portfolio-db`
- Database ID: `15577d7f-b636-4fa6-817c-8f0c77731927`
- `wrangler.toml` is already configured with this database ID.
- The allowed browser origin is configured as `https://portfolio.melekabdelmaksoud72.workers.dev`.
- The API Worker has been deployed successfully and D1 migrations `0001`–`0004` have been applied.

## Deploy through GitHub Actions

The workflow `.github/workflows/deploy-api.yml` is a manual deployment workflow. To authorize it without exposing an API token in chat or in the repository:

1. In Cloudflare, create an API token with the permissions needed for Workers Scripts and D1 (edit), scoped to this account.
2. In GitHub, open **Settings → Secrets and variables → Actions**.
3. Add repository secret `CLOUDFLARE_API_TOKEN` with that token.
4. Add repository variable `CLOUDFLARE_ACCOUNT_ID` with the account ID.
5. The deployment workflow has already run successfully from the merged `main` branch. Re-run it only when API code or migrations change.

The workflow installs Wrangler, synchronizes the admin assets, applies the D1 migrations remotely, then deploys the Worker. It does not deploy or modify the existing `portfolio` Worker.

## Security model

- Admin access is Cloudflare Access only. The Worker verifies the Access JWT signature against Cloudflare's published JWKS, issuer, audience, expiry, and exact admin email.
- There is no client-side admin password, role, or localStorage admin session.
- Visitor assistant requires a verified Cloudflare Access identity. General conversation can use Cloudflare Workers AI (GLM-4.7 Flash is the recommended free-quota default); the original MelekGPT can be selected when its private local inference endpoint is configured. When a question concerns Melek or her portfolio, only approved D1 facts are supplied as evidence; unapproved drafts are never retrieved.
- Imported facts start unapproved. The eight existing project cards remain published; newly created projects start hidden.
- Admin API writes validate inputs and accept HTTPS links only.

## Configure Cloudflare Access after deployment

The API Worker serves both protected HTML pages and API routes on the same hostname:
`https://melek-portfolio-api.melekabdelmaksoud72.workers.dev`.

Create **two separate Self-hosted Access applications** on that hostname. Do not protect the whole hostname. Protect the visitor paths listed below; keep only `/api/projects` and `/api/health` public.

### 1. Admin application

- Public hostname: `melek-portfolio-api.melekabdelmaksoud72.workers.dev`
- Paths: `/admin.html` and `/api/admin/*`
- Policy: **Allow** only the owner's exact verified email address.
- Use Cloudflare Access email one-time PIN or another verified identity provider.

### 2. Visitor account application

- Public hostname: `melek-portfolio-api.melekabdelmaksoud72.workers.dev`
- Paths: `/account.html`, `/api/models`, `/api/assistant`, and `/api/user/*`
- Policy: **Allow** authenticated email identities (any verified email).
- This is safe because every chat-history query is scoped to the email from the signed Access JWT. A visitor cannot read or delete another visitor's chats.

Do not add `/api/projects` or `/api/health` to either application. Do not use an owner-only policy for the visitor account application.

### 3. Configure Worker secrets

In Cloudflare Dashboard → Workers & Pages → `melek-portfolio-api` → Settings → Variables and Secrets, add:

- `ACCESS_ISSUER`: `https://YOUR-TEAM.cloudflareaccess.com`
- `ACCESS_AUD`: the **Admin application's** AUD tag
- `ACCESS_USER_AUD`: the **Visitor account application's** AUD tag
- `ADMIN_EMAIL`: the owner's exact verified email address

The Worker validates admin JWTs against `ACCESS_AUD` and additionally compares the signed email with `ADMIN_EMAIL`. Visitor endpoints validate JWTs against `ACCESS_USER_AUD`, verify issuer/signature/expiry, and derive the owner email from the signed claims.

Never commit the email identity or Access secrets to this public repository.

## Visitor accounts and private chat history\n\nAfter enabling the Access application, visitors can open `https://melek-portfolio-api.melekabdelmaksoud72.workers.dev/account.html` and sign in with their email. The Worker supports owner-scoped chat history APIs backed by D1 migration `0004_user_chat_history.sql`. The account page is the authenticated chat workspace. Its assistant and model catalogue require the visitor's verified Cloudflare Access identity. Conversations and messages are persisted per email identity.\n\n## Admin dashboard

After deployment and Access setup, open `https://<api-worker-host>/admin.html`. It supports:
- Create/edit/delete facts, source references, aliases, and Arabic/French/English text, including future education, skills, experience, projects, certificates, and achievements.
- New knowledge facts are saved as unapproved by default; the owner must review and explicitly approve them before the assistant can use them.
- Approve or revoke each fact.
- Create/edit/delete projects, control visibility, and set order.

The dashboard never asks for a password; Cloudflare Access supplies the identity.

## Assistant integration

The authenticated account workspace loads `/api/models` and posts questions to `/api/assistant`. Workers AI handles general chat; portfolio questions receive only approved D1 facts as grounding. The 23 seeded facts remain unapproved until reviewed in the dashboard.

The portfolio's `api-config.js` already points to the deployed API origin. `ALLOWED_ORIGIN` allows the portfolio origin, and same-origin API requests from the account workspace are also accepted.

## Local development

```bash
npm install
npm run sync-admin
npx wrangler dev
```

Access-protected admin routes require a real Cloudflare Access token and cannot be authenticated by a fake local role.

## Important limitations

- Workers AI includes 10,000 free Neurons per day on Workers Free and Paid; usage above that requires Workers Paid and is billed at $0.011 per 1,000 Neurons. The model catalogue lists Gemma 4 at $0.10 per million input tokens and $0.30 per million output tokens, and Qwen 3.8 at $0.45/$3.20 per million. Monitor actual Neuron use and review current pricing before public launch. The model catalogue can be changed with the server-side `AI_MODELS_JSON` variable; never expose provider credentials to the browser.
- The from-scratch Transformer is a research prototype only: no licensed training corpus, checkpoint, training run, or production inference exists yet.
- The browser-based Cloudflare Access sign-in flow and cross-origin iframe behavior still need verification in the production account configuration.


## AI model providers

- The default hosted option is `@cf/zai-org/glm-4.7-flash`. Cloudflare documents a shared free allocation of 10,000 Neurons per day; usage is subject to account limits and requests can fail after the free allocation on the Free plan. Check the current [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) before increasing usage.
- Gemma 4 is also available as an alternative; Qwen 3.8 is labelled metered and may consume more of the shared allocation.
- The original MelekGPT is a separate from-scratch byte-level Transformer under `melek-ai/`. It is not a hosted foundation model and has no trained checkpoint in Git. Follow `melek-ai/README.md` to build a reviewed corpus, train locally, start the bearer-protected inference server, and place it behind a named Cloudflare Tunnel.
- After the private HTTPS tunnel is ready, set Worker secrets:
  ```bash
  npx wrangler secret put MELEK_AI_URL
  npx wrangler secret put MELEK_AI_TOKEN
  ```
  `MELEK_AI_URL` must end in `/v1/chat/completions`; `MELEK_AI_TOKEN` must match the local inference server token. MelekGPT appears as unavailable until both secrets exist. The machine hosting the checkpoint must remain online.


## Automatic web learning (RAG)

Melek AI refreshes a curated set of public AI/security feeds every day at 03:00 UTC using a Cloudflare Cron Trigger. It currently reads the Cloudflare Blog, OWASP GenAI Security, Hugging Face Blog, and arXiv cs.AI/cs.LG RSS feeds. The Worker only fetches fixed HTTPS feed URLs and accepts article links from an explicit host allowlist; it stores short sanitized summaries, source URLs, publication dates, and content hashes in D1. It does not crawl arbitrary URLs supplied by a model or visitor.

For ordinary questions, the assistant ranks the refreshed summaries against the question and includes up to three relevant excerpts. Responses return the exact source URLs in `webSources`. Portfolio facts remain a separate, approved-only evidence store and cannot be overwritten by web research.

External web text is always untrusted data. It is explicitly delimited in the prompt and cannot invoke tools, change policies, access secrets, or approve portfolio facts. This reduces risk but does not eliminate prompt injection; follow the OWASP RAG and prompt-injection guidance and keep tool permissions outside the model.

Authenticated endpoints:
- `GET /api/learning/status` — signed-in user can inspect whether refresh is enabled, the number of stored sources, and the last run.
- `GET /api/admin/learning` — admin-only inventory and recent run history.
- `POST /api/admin/learning/refresh` — admin-only manual refresh.

The scheduled trigger and D1 migration are code changes only until deployed. Apply migration `0006_web_knowledge.sql` and deploy the Worker to activate the daily refresh. Cron times are UTC. This feature refreshes retrieval knowledge (RAG); it does not silently rewrite model weights. Fine-tuning is a separate offline process that must pass held-out evaluation before a checkpoint is promoted.


### Live web search

For general questions, the Worker can also call Cloudflare Web Search API through the existing `AI` binding (Ceramic provider, max 4 results per request). This is a live search, separate from the daily RSS refresh. It is enabled by `WEB_SEARCH_ENABLED = "true"`; if the AI Gateway has no credits/provider configured or the search fails, the assistant falls back to the stored daily feed index. Search results are snippets and links only; the Worker does not blindly crawl arbitrary result URLs.

**Cost note:** Cloudflare documents Ceramic at **$0.25 per 1,000 searches** through AI Gateway credits. This is not unlimited/free. At 1,000 searched chat turns, the search component is about $0.25 (model inference and any other usage are separate). Set `WEB_SEARCH_ENABLED = "false"` to disable per-question live search while keeping the daily RSS refresh. The AI Gateway must have credits or a provider key configured; otherwise live search returns no results and the cached feed index remains available.

Live search citations are rendered below assistant answers. Each verified visitor is limited to 10 live searches per rolling hour to cap costs; daily RSS retrieval remains available after the live-search limit is reached. External results remain untrusted data and cannot execute tools or modify the approved portfolio facts.
