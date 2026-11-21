# Portfolio API and admin dashboard

This is a separate Cloudflare Worker API. It does not change the current production Worker until you deploy it and route the API hostname/path deliberately.

## Security model

- Admin access is Cloudflare Access only. The Worker verifies the Access JWT signature against Cloudflare's published JWKS, issuer, audience, expiry, and exact admin email.
- There is no client-side admin password, role, or localStorage session. Do not restore the old browser-only login.
- Visitor assistant reads **only** D1 facts with `approved = 1`, returns reviewed text verbatim, and abstains when evidence is missing. It does not call a hosted model or generate factual claims.
- Imported facts start unapproved; imported projects start hidden. The owner must review them in the admin page.
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

The migration creates facts/projects tables and imports draft entries with approval/visibility disabled.

## 2. Configure Cloudflare Access

Create a self-hosted Access application protecting `/admin.html` and `/api/admin/*` on the API/portfolio hostname. Create an allow policy for the owner email only. Configure:
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

This creates a separate Worker hostname. To use same-origin `/api`, add a Worker route for `portfolio-hostname.example/api/*` pointing at this Worker, or set `window.PORTFOLIO_API_BASE` before `script.js` to the API Worker origin and set `ALLOWED_ORIGIN` to the portfolio origin. Do not guess or commit the generated Worker hostname.

## 4. Admin dashboard

After the Access application and API route are configured, open `/admin.html`. It supports:
- Create/edit/delete facts, source references, aliases, and French/English text.
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
