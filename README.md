# Bloon Arcade

Fan-made **BTD6 mini-game arcade**. The first game is **Zoomed** — identify heavily cropped / altered Monkey Tower upgrade icons as fast as you can.

Unofficial fan project. Bloons TD 6 belongs to Ninja Kiwi. Tower icons are cached locally from the [Bloons Wiki Upgrades page](https://bloons.fandom.com/wiki/Upgrades) for offline play.

## Quick start

```bash
npm install
npm run download-assets   # first time / when refreshing the dataset
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

Copy `.env.example` → `.env.local` with your Supabase URL + anon key.
Username accounts need the SQL + Edge Function in [`supabase/AUTH_SETUP.md`](supabase/AUTH_SETUP.md).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local development server |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run download-assets` | Re-scrape BTD6 tower/upgrade images + regenerate `src/data/towers.json` |
| `npm run download-assets:force` | Same, but re-download and re-upscale every image |

## Asset pipeline

`scripts/download-btd6-assets.ts`:

1. Pulls wikitext for **Primary / Military / Magic / Support** Monkey sections only
2. **Skips Heroes** (and Pro Powers)
3. Resolves File pages → CDN URLs
4. Downloads mid-size icons into `public/images/towers/...`
5. Writes `src/data/towers.json` + `src/data/towers.ts`

## Project layout

```text
src/
  data/                 # Shared tower dataset (games-agnostic)
  games/zoomed/         # Zoomed logic, difficulty, scoring, UI shell
  components/           # Shared HUD / arcade UI pieces
  utils/                # Random helpers + canvas image processing
scripts/
  download-btd6-assets.ts
public/images/towers/   # Local icon cache
```

Future modes (Bloonle, Higher or Lower, Three Clues, Order Up, …) can import from `src/data` the same way Zoomed does.

## Zoomed

- 25-round runs with progressive Easy → Extreme crops
- Procedural canvas crops (zoom, rotate, stretch, blur, pixelate, distort)
- Auto-generated wrong answers that get more similar at higher difficulty
- Score = base × difficulty × speed × streak
- Best score / streak / accuracy stored in `localStorage`
