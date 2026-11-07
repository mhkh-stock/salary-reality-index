# Salary Reality Index — Plan

## Status: v1.0 built and tested (2026-11-04)

## v1.1 review fixes (2026-11-07, local only, not pushed)

- Admin code is now fail-closed: no default anywhere, the server exits FATAL
  without `ADMIN_CODE` in the environment (previously the public demo code
  in the README could approve/reject/hide any report and so rewrite the
  published medians). Tests use a dummy fixture code and prove the exit.
- Added `GET /health`; yearly bonus capped at PKR 600,000,000 (was uncapped);
  admin `status` filter validated (400 on anything else); moderation moves
  restricted to a legal state machine (illegal move → 409).
- Admin UI: hidden/rejected reports now have a Restore button (previously
  only recoverable by direct API call). Report form experience/work-type
  selects now come from `/api/meta` instead of hardcoded HTML.
- Stats board now explains the p25–p75 band in plain words ("Typical pay —
  the middle 50% …"); empty state suggests widening filters; companies
  empty-state copy corrected (below-3 companies are not listed at all, not
  "shown as Hidden").
- Tests: 35 → 52 passing (see test.js).

- Anonymous submit form (8 roles, 11 cities, 4 experience bands, local vs
  remote-international, optional company, optional yearly bonus).
- Stats board: median, p25, p75, count, min, max, median total monthly
  equivalent — approved, non-example reports only; small-sample label under
  3; honest empty state at 0.
- Company medians: named only at ≥ 3 approved reports (server-enforced).
- Reference panel: 13 published figures with source, date, sample size and
  what each counts, plus the why-sources-disagree explanation.
- Admin: pending queue with approve/reject, approved list with hide,
  code-gated (wrong code → 403).
- Seed: 13 reference figures, 0 approved community reports, exactly 3
  EXAMPLE reports excluded from all stats.
- Tests: 35/35 passing on a fresh DB (see test.js).

## Design rules (locked)

- Never ask for name, email or login.
- Never mix reference figures into community stats.
- Never show a company name below 3 approved reports.
- Never show a 0 or an invented figure for zero matches.
- Never present a report as verified employment.

## v2 ideas (not built)

- Salary-slip verification badge (optional, privacy-reviewed first).
- City cost-of-living adjustment view.
- Trend chart: median per role over time as reports accumulate.
- Export: public stats as CSV via the existing JSON APIs.
- District-level breakdown once city samples grow.
