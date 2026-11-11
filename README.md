# Handraise

**Skills-based volunteering for students.** Handraise matches what students are already good at (design, translation, coding, tutoring) to small projects at local nonprofits, then turns the work into verified service hours.

Built for **STEMergent Hacks 2026** (Hackathon Pathway). Features 60 real nonprofits in 22 states plus DC, and 6 national online programs.

## The problem
- **92% of U.S. nonprofits** have annual budgets under $1 million (National Council of Nonprofits), so most can't hire a designer, developer or translator.
- Formal volunteering fell from **30% to 23%** of Americans between 2019 and 2021 (AmeriCorps).
- Students need service hours for graduation, honor societies and college, but most listings are generic shifts and hours are tracked on paper.

## Features
- **Accounts:** students and nonprofits sign up with Google or with email and password (Supabase Auth). Students give their age (13+ only, enforced by the database).
- **Opt-in location:** "Use my location" (browser GPS) or a city/ZIP. Only an approximate area (rounded to about 1 km) is stored. Students choose a 10, 25, 50 or 100 mile radius.
- **Nonprofits near you:** each organization shows its photo, address (linked to Google Maps), distance and website. National online programs are open to everyone.
- **Age-aware:** students only see projects they're old enough for (with a toggle to see the rest).
- **Explainable matching:** projects are ranked for each student by skills (with partial credit for related skills), causes, time, distance and growth, and every score lists its reasons.
- **Project builder:** a nonprofit describes its need in plain words, and Handraise suggests skills, scope, timeline and deliverables, showing which words it used.
- **Applicant review:** nonprofits see applicants ranked by fit and accept or decline them.
- **Verified hours:** students log hours only on accepted projects. Only the nonprofit can verify them, and the database enforces this.
- **Certificate:** a printable record of verified hours with a verification ID.
- **Impact dashboard:** live totals, hours by cause and week, and a skills-gap chart.
- **How it works page:** try the matching engine and project builder without an account.
- **Light and dark mode**, keyboard-friendly navigation and phone layouts.
- **Real organizations:** 66 real U.S. nonprofits and online programs appear as *example listings* with example project ideas. Handraise is not affiliated with them, and example listings link to each organization's own volunteer page.

## Where the nonprofit data comes from
`scripts/build-orgs.mjs` takes our hand-researched list. It **geocodes every street address** with OpenStreetMap (most matched the organization's own building by name), **loads every website**, and saves each site's preview image. A few photos come from Wikipedia. Results are in `scripts/orgs.verified.json`.

## Run locally
From inside this folder:
```bash
python -m http.server 5173
```
Then open http://localhost:5173. Live version: https://handraise-app.netlify.app

## Tests
```bash
node --test tests/logic.test.mjs
```
16 tests cover the matching rules, distance math, related-skill credit and the project builder.

## Tech
- Vanilla HTML/CSS/JavaScript with no build step
- [Supabase](https://supabase.com) for Postgres, Auth and row-level security (see [`supabase/README.md`](supabase/README.md))
- Chart.js for the charts

```
js/config.js  Supabase URL + publishable key
js/db.js      all database calls
js/location.js  opt-in location: GPS, city/ZIP search, address geocoding
js/match.js   matching engine
js/scope.js   project builder (keyword NLP)
js/data.js    skills, related-skill weights, causes
js/app.js     screens
```
