# Handraise database (Supabase)

Project: `Handraise` (ref `jkuqriloahrerekmfslu`, region us-east-2). Applied as six migrations:

1. **handraise_schema**: the tables, row-level security policies, the new-user trigger and the `community_stats()` function
2. **seed_austin_example_listings**: the first 6 Austin listings (later replaced)
3. **move_owns_project_private**: moves the `owns_project()` helper out of the public API into a `private` schema
4. **locations_ages_photos**: org city/state/ZIP/photo/online-only fields, plus student location (stored at about 1 km precision) and search radius. The sign-up trigger now copies age and location, and it **rejects anyone under 13**.
5. **seed_us_nonprofits**: 66 real U.S. nonprofits and online programs (from `scripts/orgs.verified.json`) with 181 example project ideas generated from cause templates
6. **private_student_locations**: moves student location into `student_locations`, a table **only the student can read or write**, because nonprofits can read applicants' profiles and must never see where a student lives

## Tables
| Table | What it holds |
|---|---|
| `profiles` | One row per user (created automatically on sign-up): first name, age, grade, skills, learning goals, causes, hours per week |
| `student_locations` | A student's approximate location (about 1 km) and search radius. Readable only by that student. |
| `orgs` | Nonprofits. `owner_id` is the account that manages it. Example listings have no owner. |
| `projects` | Micro-projects posted by an org |
| `applications` | A student applying to a project (`applied` → `accepted` / `declined`) |
| `hour_logs` | Hours a student logs (`pending` → `verified` / `rejected`) |

## Who can do what (row-level security)
- **Anyone** (even signed out) can browse orgs and projects, and call `community_stats()`, which returns totals only and no personal data.
- **Students** can read and edit only their own profile and location, apply to real (non-example) open projects, withdraw pending applications, and log hours **only on projects they were accepted to**. A new hour log must start as `pending`.
- **Nonprofit owners** can edit their own org and projects, see applicants' profiles (first name, age, grade, skills; never location) **only for their own projects**, accept or decline applications, and verify or decline hours.
- **Nobody** can edit example listings, apply to them, approve their own application, or verify their own hours.

These rules were tested with a simulated student and nonprofit inside a rolled-back transaction (17 of 17 checks passed), and again after adding location and age (under-13 sign-up blocked; nonprofits can't see or edit student locations). The full flow is saved in `tests/full_flow.sql`: paste it into the SQL editor and run it. It prints 16 results and rolls itself back.
