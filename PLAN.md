# Salary Reality Index — Plan

## Status: v1.0 built and tested (2026-11-04)

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
