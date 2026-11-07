# Salary Reality Index — Real Pakistani Salaries, From Real Reports

Anonymous, graduate-focused salary board for Pakistan. No names, no emails,
no logins — ever. Community medians come **only** from admin-approved
anonymous reports. Published figures from other platforms are shown in a
separate panel, with source and date, and are **never** mixed into community
medians.

## How it works

1. **Report (anonymous):** pick role (8 roles), city (11 options incl. Remote
   Pakistan / Remote International), experience band (0–1, 1–3, 3–5, 5+
   years), monthly base salary in PKR, optional yearly bonus, work type
   (Local Pakistan vs Remote International), optional company name.
2. **Approval rule:** every report starts PENDING and is invisible in stats
   until the admin approves it. Rejected reports never count; hidden reports
   stop counting.
3. **Stats board:** filter by role + city + experience + work type. For the
   filtered set of APPROVED, non-example reports only: median, 25th and 75th
   percentile, count, min, max of monthly base salary, plus the median total
   monthly equivalent (base + bonus ÷ 12). Median for an even count is the
   average of the two middle values; percentiles use the nearest-rank method.
4. **Small-sample honesty:** fewer than 3 matching approved reports → the
   numbers show with a clear "small sample — treat with care" label. Zero
   matches → an honest empty state, never a 0 or an invented figure.
5. **Company rule (server-enforced):** a company name is displayed only when
   at least 3 approved reports name it. Below 3 it stays hidden — that
   protects reporters. The rule is enforced in the API, not just the page.
6. **Reference panel (separate):** published figures from Levels.fyi,
   PayScale, Indeed Pakistan and guide ranges, each with figure, source,
   date, sample size where known, and what it counts (total comp vs base).
   Includes the plain-words explanation of why sources disagree: Levels.fyi
   skews to top companies and counts stock + bonus, while broader sources
   skew base-only.

## Seed data

- **13 published reference figures** (see `seed-data.json`): Levels.fyi
  Software Engineer Pakistan median total comp PKR 258,790/month (124
  salaries, 2026-11-04); Systems Limited PKR 391,921/month; Rawalpindi PKR
  195,009/month (9 salaries); PayScale base average Rs 965,218/year, entry
  total comp Rs 715,365/year (73 salaries), early-career Rs 1,041,918/year
  (359 salaries); Indeed Entry Level Developer Rs 85,957/month (20
  salaries, Sep 2026), Junior Developer Rs 52,347/month, Junior Data Analyst
  Rs 62,993/month (12 salaries, Oct 2026); plus 4 guide ranges labelled as
  ranges only.
- **Zero approved community reports** at launch.
- **Exactly 3 EXAMPLE reports** (labelled EXAMPLE in the database,
  `is_example=1`) so the mechanics can be seen. They are excluded from every
  stat and company list — the tests prove this.

## Run it

```bash
ADMIN_CODE=your-private-code node server.js   # REQUIRED — server exits without it; there is no default code
DB_FILE=/tmp/salary.sqlite ADMIN_CODE=your-private-code node server.js   # custom DB path (SnapDeploy)
node test.js              # full test suite on a throwaway DB (uses a dummy test code)
```

## API

- `GET /health` — liveness check (`{ok: true}`).
- `GET /api/meta` — allowed roles, cities, experience bands, work types.
- `GET /api/stats?role=&city=&exp=&work=` — approved-only stats.
- `GET /api/reference` — published figures with source + date.
- `GET /api/companies` — only companies with ≥ 3 approved reports, medians.
- `POST /api/report` — creates a PENDING report. Validates role/city/exp
  against the allowed lists and base salary as a positive number under PKR
  50,000,000/month and yearly bonus under PKR 600,000,000, else 400.
- `GET /api/admin/reports?code=&status=` — moderation queue (pending /
  approved / rejected / hidden / all; any other status → 400). Wrong code → 403.
- `POST /api/admin/approve|reject|hide` — `{code, id}`. Wrong code → 403.
  Only legal moderation moves are allowed (approve from pending/hidden/
  rejected, reject from pending/approved, hide from approved only); an
  illegal move → 409, unknown id → 404.

## Honest limits

- Community medians are only as good as their approved reports, and small
  samples are labelled as such.
- Published reference figures are other platforms' data, shown with source,
  not the app's own — and never merged into community medians.
- No report is ever presented as verified employment. A report is an
  anonymous self-report that passed a spam/moderation check, nothing more.
- The admin code comes only from the `ADMIN_CODE` environment variable —
  there is no default and the server refuses to start without it. Never
  publish the code: anyone holding it can approve, reject or hide reports
  and so change the published medians. Set a private code in the deploy
  environment and keep it out of the repo, docs and screenshots.
- No SMS/WhatsApp alerts, no employer verification, no salary-slip checks
  (v2 ideas — see PLAN.md).
