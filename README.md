# Don\'t Forget

Stack: Next.js 14 (App Router), TypeScript strict, TailwindCSS, ESLint, Prettier.

## Démarrage

- `npm run dev` – serveur dev (http://localhost:3000)
- `npm run build` – build prod
- `npm run start` – run prod
- `npm run lint` – ESLint (fail si warning)
- `npm run format` – formatte avec Prettier
- `npm run format:check` – vérifie le format

## Config

- Variables d’environnement: voir `.env.example` (copie de `env.example`).
- Sur Vercel: créer les mêmes variables (`GOOGLE_*`, `SHEETS_DISABLED`, `CACHE_TTL_HOURS`).

## API

- `POST /api/recommend`: input `WizardState`, output `[Product]` (mock pour l’instant).

## Schémas Zod

- `WizardState`: `{ country: ISO2, dates: {start,end} ISO8601, travelers: 1..20, ages: int 0..120[] }` avec contraintes (taille `ages` = `travelers`, `start <= end`).
- `Product`: `{ label, asin, affiliateLink }` renvoyé après tri (mustHave d’abord, puis priority croissant) et filtres (status=active, pays, âges).
