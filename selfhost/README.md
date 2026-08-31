# Home API (N100)

Postgres + PostgREST on this box. Existing homelab Caddy already serves
`*.blinkywink.co`, so the public URL is **https://api.blinkywink.co**.
Website images stay on Vercel until we switch Pages.

Do not replay `supabase/*.sql`. Restore a live dump.

```bash
cd ~/monkeycards-api
docker compose up -d postgres
./scripts/restore.sh data/monkeycards.dump
docker compose up -d
# caddy.snippet goes ABOVE the *.blinkywink.co catch-all, then:
~/caddy/apply-caddy-live.sh
```

- Postgres: `127.0.0.1:5433`
- PostgREST: `127.0.0.1:3001`

Frontend env after smoke-test:

- `VITE_SUPABASE_URL=https://api.blinkywink.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=` (anon JWT from `node scripts/mint-anon-jwt.mjs`)

Ship desktop/mobile with those values before turning off Supabase.
