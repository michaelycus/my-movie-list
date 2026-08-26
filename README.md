# CineMood

Pick a film a whole group will actually enjoy, in under a minute. CineMood
stores each friend's taste profile plus tonight's mood, then ranks a 5,000-film
catalog so the pick is a good compromise rather than one loud person's
favourite. Solo browsing supports natural-language search too ("something
funny but not stupid").

Built with Next.js (App Router), TypeScript, Tailwind, and Supabase
(Postgres + `pgvector` + Auth). See [`blueprint/project-plan.md`](blueprint/project-plan.md)
for the full product and technical plan.

## Commands

- Dev server: `npm run dev` (http://localhost:3000)
- Build: `npm run build`
- Production server: `npm run start`
- Lint: `npm run lint`

This project is developed with the [AI Blueprint](AGENTS.md) workflow. See
`AGENTS.md` for the full command and convention set.
