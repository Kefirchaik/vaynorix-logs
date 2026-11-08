# VAYNORIX RP · Logs Control Center

Private staff-facing read-only game logs portal for **Vercel**. 19 whitelisted log categories based on the VAYNORIX MariaDB schema from 2026-11-08. No PHP, no email, no public registration. One Owner + up to two Admins (created/removed by Owner). Admin passwords are salted scrypt hashes in a separate Redis database, never the game database.

## Deploy on Vercel (5–10 minutes)

1. Open [Vercel → New Project](https://vercel.com/new), choose **Import Git Repository**, select `Kefirchaik/vaynorix-logs`.
2. **Framework Preset:** `Other`. **Root Directory:** `./` (repository root). **Build Command:** leave blank / override off. **Output Directory:** leave blank / override off. **Install Command:** default `npm install`. Use Node.js 22.x if available.
3. In **Storage / Marketplace**, create **Upstash Redis**, connect it to the Vercel project. Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to **Settings → Environment Variables** if they were not added automatically. Redis is needed for persistent Admin accounts and login rate limiting; Vercel functions have no persistent local disk.
4. Create a separate **SELECT-only** MySQL account for your VAYNORIX MariaDB database and make sure Vercel functions can reach its host and port. Avoid using your SA-MP server's privileged MySQL account. Do not upload the SQL dump to GitHub or Vercel.
5. Set the variables below for **Production** (and Preview only if intentionally testing there). Then click **Deploy / Redeploy**.
6. Open the assigned `*.vercel.app` domain and log in with the `OWNER_USERNAME` and `OWNER_PASSWORD` you chose. In **Администраторы**, create up to two logins with passwords, without email or confirmation.

## Environment Variables (Vercel → Project → Settings → Environment Variables)

| Key | What to enter |
| --- | --- |
| `DB_HOST` | **MySQL host**, not SA-MP game IP/UDP port |
| `DB_PORT` | MySQL TCP port, usually `3306` |
| `DB_NAME` | Game database name (e.g. `gs325627`) |
| `DB_USER` | Dedicated MySQL user with **SELECT** only |
| `DB_PASSWORD` | Password for dedicated read-only MySQL user |
| `DB_SSL` | `true` if MySQL provider supports proper TLS, otherwise `false` |
| `OWNER_USERNAME` | Your desired Owner login, e.g. `Owner` |
| `OWNER_PASSWORD` | **Choose a strong password (12+ characters)**, never commit |
| `SESSION_SECRET` | Random string 32+ characters, ideally 64 hex chars |
| `UPSTASH_REDIS_REST_URL` | From Upstash Redis in Vercel |
| `UPSTASH_REDIS_REST_TOKEN` | From Upstash Redis in Vercel |

To generate `SESSION_SECRET` locally, run:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**DB access is read only.** If your hosting provider blocks remote MySQL, you need to enable secure remote access or host a private database gateway. **The game server port `1481` is not your DB port.** Connecting to local `127.0.0.1` from Vercel will *not* reach the game host.

## Security

- Backend allows only whitelisted SELECT queries; raw table/column names from visitors are never evaluated.
- Authentication uses Secure/HttpOnly/SameSite=Strict cookies with HMAC signatures, 8-hour expiry, rate limiting, and admin session revocation on account reset/deletion.
- Admins do not see full player IPs; Owner can. Neither role can see game passwords, salts, or banking PINs.
- Redis account storage is separate from gameplay data. Owner credentials are read from Vercel environment variables.
- No source-code passwords, production SQL data, or token files are committed. GitHub repository can be public because the code has no secrets; if desired, make it private.
- Do not place a writable database password in Vercel. Test the DB account with `SHOW GRANTS` and grant only `SELECT`.

## Troubleshooting

- **503 not configured**: a required Environment Variable is missing, or OWNER_PASSWORD/SESSION_SECRET is too short. Redeploy after updating variables.
- **503 Redis unavailable**: check Upstash REST URL/token and project integration.
- **Journal unavailable**: check database remote TCP access, credentials and table schema in the Vercel Function Logs. Grant `SELECT` on all required log tables and `accounts`/`bank_accounts` for name joins.
- **Error after deploy**: check the latest deployment under **Vercel → Project → Deployments → Functions / Runtime Logs**.
- No SA-MP `.amx`, PHP runtime, additional game MySQL migrations, or email service required.

## Local sanity check

```bash
npm install
npm run check
```