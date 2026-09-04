# Litquest

A reading-comprehension app: read a book, take an AI-generated quiz on it, earn points and level up.

## How it works

- **Frontend**: plain HTML/CSS/JS in `public/`.
- **API**: Cloudflare Pages Functions in `functions/api/`.
- **Database**: Cloudflare D1 (SQLite), schema in `db/schema.sql`.
- **Quizzes**: generated on demand by calling Groq's free API (Llama 3.3) when a book is marked "finished."

## First-time setup

```bash
npm install
npx wrangler login              # opens a browser to connect your (free) Cloudflare account
npx wrangler d1 create litquest-db
```

Copy the `database_id` that command prints into `wrangler.toml` (replacing `REPLACE_ME_AFTER_WRANGLER_D1_CREATE`).

```bash
cp .dev.vars.example .dev.vars  # then edit .dev.vars and paste in a real GROQ_API_KEY (free at console.groq.com)
npm run db:init:local           # creates the local dev database tables
```

## Run it locally

```bash
npm run dev
```

Opens at `http://localhost:8788`. Any device on the same wifi can reach it at `http://<your-mac's-local-IP>:8788`.

## Deploy for free, reachable from anywhere

1. Push this repo to GitHub.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**, pick this repo. Build output directory: `public`.
3. In the Pages project settings, bind the D1 database (`litquest-db` → binding name `DB`).
4. In the Pages project settings → **Environment variables**, add `GROQ_API_KEY` as a secret.
5. Run `npm run db:init:remote` once to create the tables in the production database.

After that, every `git push` to the connected branch auto-deploys.
