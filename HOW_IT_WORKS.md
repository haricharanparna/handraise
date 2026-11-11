# How Handraise works: study this before judging

Open each file while you read.

## 1. Accounts and the database (`js/db.js`, `supabase/README.md`)
- **Supabase** gives us a Postgres database and sign-in (email and password).
- When someone signs up, a database **trigger** creates their row in `profiles` automatically.
- The browser uses a **publishable key**. That's safe because of **row-level security (RLS)**: rules inside the database decide which rows each user can read or change. Example rules:
  - Students can only insert hour logs where `status = 'pending'`, and only for projects where their application is `accepted`.
  - Only the owner of the organization can update an hour log to `verified`.
  - Nonprofits can see a student's profile only if that student applied to one of their projects.
- **Why this matters:** if security only lived in the website, anyone could open the browser console and call the API directly. RLS means the database refuses no matter what.
- We tested this by simulating a student and a nonprofit in a rolled-back transaction. All checks passed, including "student tries to verify their own hours → blocked." The full-flow version is saved in `supabase/tests/full_flow.sql` (16 steps, rolls itself back), so you can rerun it in the Supabase SQL editor.

## 2. Matching engine (`js/match.js`)
**Step 1: Hard rules.** Too young, remote-only for an in-person project, or a local organization outside the student's search radius (10, 25, 50 or 100 miles) means the student can't join. Distance uses the **haversine formula** (distance on a sphere from latitude and longitude).

**Step 2: Weighted score.**
| Part | Weight | How |
|---|---|---|
| Skills | 50% | For each skill needed, take the student's best related skill (1.0 exact, e.g. 0.5 related, 0.35 if they want to learn it), then average |
| Cause | 20% | 1 if the student cares about the project's cause |
| Time | 15% | Student hours/week ÷ project hours/week, capped at 1 |
| Distance | 10% | Online or remote = 1, otherwise 1 − miles/radius |
| Growth | 5% | 1 if the project uses a skill they want to learn |

**Related-skills graph:** `RELATED` in `js/data.js` (design↔social 0.5, web↔coding 0.7…).

**Why not machine learning?** There's no history of past matches to learn from yet. Hand-set weights work from day one and are easy to explain. Later, we can learn the weights from which matches lead to completed projects.

## 3. Project builder (`js/scope.js`)
It looks for about 140 phrases across 17 skills ("flyer" and "poster" → graphic design, "Instagram" → social media). It keeps the top 3 skills, estimates student-sized hours, decides remote or in person, fills in deliverables, and highlights the words it matched. This is rule-based **natural-language processing**: fast, free and transparent.

## 4. Location and age (`js/location.js`, `js/match.js`)
- Location is **opt-in**. "Use my location" asks the browser for permission (the Geolocation API), or the student types a city or ZIP (Open-Meteo geocoding).
- We round coordinates to 2 decimal places (about 1 km), so we never store a minor's exact home address. Signed-out visitors' location stays in their own browser.
- Distance = haversine formula. Local organizations outside the student's radius (10, 25, 50 or 100 miles) are hidden. National online programs show for everyone.
- Age is required for student accounts. The database trigger **refuses sign-ups under 13**, and projects with a higher minimum age are hidden unless the student chooses to see them.
- Nonprofit addresses are geocoded with OpenStreetMap Nominatim when they register.

## 5. Example listings
The 100 real organizations and online programs have `is_example = true` and no owner. The database blocks applications to them and blocks anyone from editing them. On screen they say "Example listing" and link to the organization's real volunteer page.

Not every place to volunteer is a nonprofit. Each organization has an `org_type` (nonprofit, public library, parks department, hospital, museum, school, government program or university research), and every listing shows it as a label. Organizations that sign up pick their type.

## 6. Certificate and impact
- The certificate counts **verified** hours only. The verification ID is a short hash of the verified log IDs and the total.
- `community_stats()` is a database function that returns **totals only** (no names), so signed-out visitors can see impact without seeing anyone's data.
- Value = hours × $33.49 (Independent Sector, 2023).

---

## Practice these questions
1. *How do you stop fake hours?* Only the nonprofit can verify, and that's enforced by row-level security in the database.
2. *Is student data safe?* First names only. Profiles are visible only to the student and to nonprofits they applied to. Signed-out users see no personal data.
3. *Where's the STEM/AI?* The weighted recommendation engine, the related-skills graph, haversine distance, the NLP project builder, and the database security design.
4. *Are those real nonprofits?* They're real U.S. organizations: 63 nonprofits plus libraries, parks departments, hospitals, museums and government programs, each labeled with what it is. Our script geocoded every address and checked every website. They're shown as labeled example listings. We're not affiliated, and they link to the real volunteer pages. Any nonprofit can sign up and post.
5. *How does location work, and is it safe?* It's opt-in, rounded to about 1 km, and used only to measure distance. Nonprofits never see a student's location.
6. *How does it scale?* Static hosting plus Supabase's free tier. Next: school sign-in, parent consent, and counselor views.
