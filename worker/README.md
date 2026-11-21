# Portfolio API and admin dashboard

This is a separate Cloudflare Worker API. It does not change the current production Worker until you deploy it and route the API hostname/path deliberately.

## Security model

- Admin access is Cloudflare Access only. The Worker verifies the Access JWT signature against Cloudflare's published JWKS, issuer, audience, expiry, and exact admin email.
- There is no client-side admin password, role, or localStorage session. Do not restore the old browser-only login.
- Visitor assistant reads **only** D1 facts with `approved = 1`, returns reviewed Arabic, French, or English text verbatim, and abstains when evidence is missing. It does not call a hosted model or generate factual claims.
- Imported facts start unapproved. The eight seeded projects are already public on the current portfolio, so their visibility is preserved; new projects start hidden until explicitly published.
- Admin API writes validate inputs and accept HTTPS links only.

## 1. Create D1 and apply migration

From this directory:

```bash
npx wrangler d1 create melek-portfolio
```

Copy the returned database ID into `wrangler.toml`, then:

```bash
npx wrangler d1 migrations apply melek-portfolio --remote
```

The migrations create facts/projects tables, import 23 unapproved trilingual facts, preserve the eight projects already shown publicly, and keep newly created projects hidden by default.

## 2. Configure Cloudflare Access

Protect the admin page and admin API paths with Cloudflare Access. The Worker bundles the admin dashboard as static assets, so it is served from the API Worker's own hostname. Create one hostname/path Access application protecting that Worker hostname's `/admin.html` and `/api/admin/*` paths, with an allow policy for the owner email only. Do not protect the entire Worker, because public `/api/assistant` and `/api/projects` must remain public. Configure:
- `ACCESS_ISSUER`: e.g. `https://YOUR-TEAM.cloudflareaccess.com`
- `ACCESS_AUD`: the Access application's AUD tag
- `ADMIN_EMAIL`: `melekabdelmaksoud72@gmail.com`
- `ALLOWED_ORIGIN`: exact portfolio origin, e.g. `https://portfolio.melekabdelmaksoud72.workers.dev`

Set the first three as Worker secrets/vars (issuer and audience are identifiers, not passwords; secrets are still acceptable):

```bash
npx wrangler secret put ACCESS_ISSUER
npx wrangler secret put ACCESS_AUD
npx wrangler secret put ALLOWED_ORIGIN
```

`ADMIN_EMAIL` is configured in `wrangler.toml`; change it if the Access identity differs.

## 3. Deploy the API

```bash
npm install --save-dev wrangler
npm run sync-admin
npx wrangler deploy
```

This creates a separate Worker hostname. Before deployment, run `npm run sync-admin` to copy the root admin UI into `worker/admin-assets`. The API Worker serves `/admin.html`, `/admin.css`, `/admin.js`, and `/api-config.js` from its own origin; its admin API calls are therefore same-origin and protected by the same Access application. Set `window.PORTFOLIO_API_BASE` in the root portfolio's `api-config.js` to the deployed API Worker origin so the public chat/project UI can call `/api/assistant` and `/api/projects`. Set `ALLOWED_ORIGIN` to the exact portfolio origin. The root `/admin.html` redirects to the protected dashboard on the API Worker once that origin is configured. Do not guess or commit the generated Worker hostname.

## 4. Admin dashboard

After deploying and configuring Cloudflare Access, open `https://<your-api-worker-host>/admin.html` (or the portfolio's `/admin.html` redirect once `api-config.js` is set). It supports:
- Create/edit/delete facts, source references, aliases, and Arabic/French/English text.
- Approve or revoke each fact.
- Create/edit/delete projects, control visibility, and set order.

The dashboard never asks for a password; Cloudflare Access supplies the identity.

## 5. Assistant integration

The portfolio chat posts questions to `/api/assistant`. Only approved D1 facts are considered. Until the API is deployed and the draft facts reviewed, the assistant deliberately abstains. This is intentional and safer than silently falling back to a browser-only answer engine.

## Local development

```bash
npm install
npx wrangler dev
```

Set a local D1 database with the same migration before testing admin/assistant endpoints. Access-protected admin routes require a real Cloudflare Access token and cannot be authenticated by a fake local role.

## Important limitation

This API is a reliable, source-bound portfolio assistant and admin CRUD backend, not a general ChatGPT-class model. A small from-scratch Transformer is kept as a separate research experiment; it is not trained, deployed, or used to invent facts.
