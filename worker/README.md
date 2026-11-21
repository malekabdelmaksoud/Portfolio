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

Protect the admin page and admin API paths with Cloudflare Access. If the portfolio and API share one hostname, protect `/admin.html` and `/api/admin/*` in the same Access application. If the API is deployed on its own `workers.dev` hostname, create one Access application for the portfolio's `/admin.html` path and another for the API hostname's `/api/admin/*` path. In both policies, allow only the owner email. Do not protect the API Worker's entire hostname, because public `/api/assistant` and `/api/projects` must remain public. Configure:
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
npx wrangler deploy
```

This creates a separate Worker hostname. Recommended: serve the API under the portfolio's same-origin `/api/*` path if your Cloudflare setup supports that route. Otherwise set `window.PORTFOLIO_API_BASE` in `api-config.js` to the deployed API Worker origin, set `ALLOWED_ORIGIN` to the exact portfolio origin, and keep the admin Access app on the API's `/api/admin/*` path. The admin dashboard sends credentials and the Worker enables credentialed CORS for that exact origin. A cross-origin Access setup may require the browser to complete the Access login for the API hostname once. Do not guess or commit the generated Worker hostname.

## 4. Admin dashboard

After the Access application and API route are configured, open `/admin.html`. It supports:
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
