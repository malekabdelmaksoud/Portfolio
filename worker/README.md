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
- Public visitor accounts are planned to use native Worker email OTP with D1-backed server sessions; Cloudflare Access must not be used for public users.
- There is no client-side admin password, role, or localStorage admin session.
- Visitor assistant reads only D1 facts with `approved = 1`, returns reviewed Arabic, French, or English text verbatim, and abstains when evidence is missing. It does not call a hosted model or invent factual claims.
- Imported facts start unapproved. The eight existing project cards remain published; newly created projects start hidden.
- Admin API writes validate inputs and accept HTTPS links only.

## Configure Cloudflare Access after deployment

The API Worker serves both protected HTML pages and API routes on the same hostname:
`https://melek-portfolio-api.melekabdelmaksoud72.workers.dev`.

Create **two separate Self-hosted Access applications** on that hostname. Do not protect the whole hostname: public `/api/assistant`, `/api/projects`, and `/api/health` must remain reachable.

### 1. Admin application

- Public hostname: `melek-portfolio-api.melekabdelmaksoud72.workers.dev`
- Paths: `/admin.html` and `/api/admin/*`
- Policy: **Allow** only the owner's exact verified email address.
- Use Cloudflare Access email one-time PIN or another verified identity provider.

### 2. Public visitor authentication (target architecture)

- Do NOT create a Cloudflare Access application for `/account.html` or `/api/user/*`.
- Public accounts must use native email OTP and server-side D1 sessions implemented by the Worker.
- Cloudflare Access seats are reserved for the administrator application only.
- Until native OTP is implemented and deployed, the existing visitor account endpoints still require the legacy Access JWT flow; do not remove that flow before the replacement is tested and ready.

### 3. Configure Worker secrets

In Cloudflare Dashboard → Workers & Pages → `melek-portfolio-api` → Settings → Variables and Secrets, add:

- `ACCESS_ISSUER`: `https://YOUR-TEAM.cloudflareaccess.com`
- `ACCESS_AUD`: the **Admin application's** AUD tag
- `ACCESS_USER_AUD`: the **Visitor account application's** AUD tag
- `ADMIN_EMAIL`: the owner's exact verified email address

The Worker validates admin JWTs against `ACCESS_AUD` and additionally compares the signed email with `ADMIN_EMAIL`. Visitor endpoints validate JWTs against `ACCESS_USER_AUD`, verify issuer/signature/expiry, and derive the owner email from the signed claims.

Never commit the email identity or Access secrets to this public repository.

## Visitor accounts and private chat history\n\nAfter enabling the Access application, visitors can open `https://melek-portfolio-api.melekabdelmaksoud72.workers.dev/account.html` and sign in with their email. The Worker supports owner-scoped chat history APIs backed by D1 migration `0004_user_chat_history.sql`. The account page is a history manager; it does not yet turn the public portfolio chat into a signed-in chat composer. The public assistant remains accessible without login and is not persisted automatically.\n\n## Admin dashboard

After deployment and Access setup, open `https://<api-worker-host>/admin.html`. It supports:
- Create/edit/delete facts, source references, aliases, and Arabic/French/English text.
- Approve or revoke each fact.
- Create/edit/delete projects, control visibility, and set order.

The dashboard never asks for a password; Cloudflare Access supplies the identity.

## Assistant integration

The portfolio chat posts questions to `/api/assistant`. Only approved D1 facts are considered. The 23 seeded facts remain unapproved until reviewed in the dashboard; the assistant intentionally abstains until there is approved evidence.

The portfolio's `api-config.js` already points to the deployed API origin. `ALLOWED_ORIGIN` is configured for the production portfolio.

## Local development

```bash
npm install
npm run sync-admin
npx wrangler dev
```

Access-protected admin routes require a real Cloudflare Access token and cannot be authenticated by a fake local role.

## Important limitations

- This API is a source-bound portfolio assistant and admin CRUD backend, not a general ChatGPT-class model.
- The from-scratch Transformer is a research prototype only: no licensed training corpus, checkpoint, training run, or production inference exists yet.
- Server-side owner-scoped chat-history APIs and D1 tables exist, but the public chat composer is not yet connected to signed-in account persistence.
