# Username auth (no email)

Accounts use **username + password** stored in Postgres (`public.accounts`).
Sessions are opaque tokens in `public.app_sessions`. The browser sends
`x-bloon-session` on API calls - **no Supabase Email Auth, no mailer**.

## Setup

Already applied to the linked project via `username_auth.sql`.
Also run `supabase/daily_bonus.sql` (5K signup Cash + daily 500 claim).

To re-apply on a new project:

1. Run `supabase/schema.sql` (profiles)
2. Run `supabase/username_auth.sql`
3. Run `supabase/daily_bonus.sql`
4. Put URL + publishable key in `.env.local`

No Edge Function deploy needed.
