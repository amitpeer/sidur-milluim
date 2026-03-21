# Schedule Algorithm — Benchmark & Optimization Guide

## What this is

An ongoing effort to improve the IDF reserve duty scheduling algorithm. The scheduler assigns soldiers to operational days while respecting:

- **Headcount** — exactly N soldiers on-base each day
- **Roles** — minimum counts per role (drivers, commanders, navigators)
- **Constraints** — soldier-specific day-off requests
- **Fairness** — equal distribution of total duty days across soldiers
- **Block quality** — long consecutive blocks (avoid 1-2 day stints)

## Architecture

The algorithm is a 2-stage pipeline:

1. **Construction** (`schedule-generator.ts`) — builds a rotation template with staggered phase offsets, then applies headcount trim, padding, and role fixing.
2. **Refinement** (`schedule-refiner.ts`) — Simulated Annealing that swaps/transfers soldiers between days to optimize fairness and block quality while preserving hard constraints.

## How to run benchmarks

```bash
# Run the benchmark (uses saved fixture data, no DB needed)
npx vitest run src/domain/schedule/benchmarks/benchmark.test.ts

# Re-export fixtures from production DB (only when data changes)
# Requires DATABASE_URL in .env
npx vitest run src/domain/schedule/benchmarks/export-fixtures.test.ts
```

## How to iterate

1. Make a change to `schedule-generator.ts` or `schedule-refiner.ts`
2. Run the benchmark
3. Compare the output against the latest numbered result in `results/`
4. If it's an improvement, save it:
   ```bash
   cp results/<timestamp>.json results/<NNN>-<short-description>.json
   ```
5. Add an entry to the Results Log below with the algorithm description, metrics table, and notes
6. Update the Comparison Summary table

## Metrics explained

| Metric | What it means | Target |
|---|---|---|
| Headcount violations | Days where on-base count != configured headcount | 0 |
| Role violations | Days missing minimum role-holders (e.g., < 4 drivers) | 0 |
| Constraint violations | Soldiers scheduled on their day-off dates | 0 |
| Fairness variance | max(days) - min(days) across all soldiers | < 10 |
| Short blocks | % of blocks shorter than minBlock (typically 4 days) | < 10% |
| Duration | Wall-clock time for generation + refinement | < 500ms |

## Key tuning parameters

### Construction (`schedule-generator.ts`)

- `onDuration = ceil(cycle * headcount / N)` — days per soldier in rotation window. Higher = more soldiers raw on-base = more trimming, less padding. Currently `ceil` (5 for 25 soldiers, hc=8, cycle=14).
- `trimToHeadcount` — sorts by rotation window position descending (right-edge first). Preserves block starts, trims from ends.
- `padToHeadcount` — prefers soldiers on-base yesterday (adjacent = extends block).
- `fixRolesAtHeadcount` — prefers adjacent role-holders, avoids removing mid-block soldiers.

### Refinement (`schedule-refiner.ts`)

- `START_TEMP = 150` — initial SA temperature
- `COOLING = 0.9995` — cooling rate. Lower = more iterations. Currently ~19200 iterations.
- `FAIRNESS_WEIGHT = 300` — cost multiplier for fairness variance
- `BLOCK_PENALTY = 200` — cost multiplier for short blocks
- `HEADCOUNT_PENALTY = 5000` — cost multiplier for headcount violations
- Move types: 80% swap (same day, different soldiers), 20% transfer (move soldier between days)
- Adjacency guard: swap-in must extend an existing block; swap-out must not create a short block

## Known limitations & improvement ideas

- **Fairness ceiling ~13**: Drivers structurally serve more days (4/8 slots = 50% of days vs ~33% for non-role soldiers). True fairness < 10 would require role-weighted fairness or role-specific on-durations.
- **Short blocks from constraints**: A constraint on day 3 of a 5-day block splits it into 2+2. Construction could offset rotation phases to avoid constraints falling mid-block.
- **City grouping**: Soldiers from the same city should serve together. Currently affects rotation ordering but not trim/pad.
- **More fixture scenarios**: Currently only one season ("בדיקה"). Adding more scenarios would make benchmarks more robust.

## File structure

```
benchmarks/
  README.md                     ← this file
  benchmark.test.ts             ← benchmark runner (run this)
  export-fixtures.test.ts       ← re-export DB data as fixtures
  fixtures/
    real-data.json              ← saved production data (soldiers, constraints, season config)
  results/
    001-greedy-baseline.json    ← original greedy algorithm
    002-rotation-v1.json        ← first rotation attempt
    ...
    006-rotation-v5-....json    ← current best
```

---

## Results Log

### 001 — Greedy baseline (pre-refactor)

**File:** `results/001-greedy-baseline.json`

**Algorithm:** 7-stage greedy pipeline: greedy scoring → fixRoleCoverage → mergeShortBlocks → rebalanceDays → mergeShortBlocks → fixRoleCoverage → SA refiner (swap-only, strict adjacency, COOLING=0.9985, FAIRNESS_WEIGHT=200, BLOCK_PENALTY=50).

| Metric | Value |
|---|---|
| Headcount violations | 0 / 62 |
| Role violations | **7** |
| Constraint violations | 0 / 26 |
| Fairness variance | 20 (18-38) |
| Short blocks (<4d) | **6.1%** (6/99) |
| Duration | 280ms |

**Block distribution:** 2d:3, 3d:3, 4d:23, 5d:25, 6d:7, 7d:8, 8d:7, 9d:10, 10d:6, 11d:4, 12d:3

**Notes:** Good block quality (only 6% short). Main problems: 7 role violations (days without enough drivers), high fairness variance (20 — drivers serve 25-38 days, non-drivers 18-23). Drivers with dual roles (driver+navigator) get overloaded to 38 days.

---

### 002 — Rotation construction v1 (relaxed SA)

**File:** `results/002-rotation-v1.json`

**Algorithm:** 2-stage pipeline: rotation template construction (staggered phase offsets, headcount-calibrated onDuration=round, role-aware trim/pad/fix) → SA refiner (swap + transfer moves, relaxed adjacency, COOLING=0.997, FAIRNESS_WEIGHT=300, BLOCK_PENALTY=200, HEADCOUNT_PENALTY=5000).

| Metric | Value |
|---|---|
| Headcount violations | 0 / 62 |
| Role violations | **0** |
| Constraint violations | 0 / 26 |
| Fairness variance | **16** (18-34) |
| Short blocks (<4d) | **39.5%** (62/157) |
| Duration | 198ms |

**Block distribution:** 1d:5, 2d:22, 3d:35, 4d:48, 5d:33, 6d:4, 7d:4, 8d:3, 9d:1, 10d:2

**Notes:** Fixed all role violations and improved fairness (16 vs 20). But block quality regressed badly — 39.5% short blocks. Cause: SA's relaxed adjacency breaks blocks apart to improve fairness.

---

### 003 — Rotation v2: restored SA adjacency guards

**File:** `results/003-rotation-v2-adjacency.json`

**Algorithm:** Same construction as 002. SA: restored adjacency guard, added `wouldCreateShortBlock` check, COOLING=0.999 (~9600 iterations).

| Metric | Value |
|---|---|
| Headcount violations | 0 / 62 |
| Role violations | **0** |
| Constraint violations | 0 / 26 |
| Fairness variance | **13** (19-32) |
| Short blocks (<4d) | 26.8% (40/149) |
| Duration | 49ms |

**Block distribution:** 1d:3, 2d:18, 3d:19, 4d:65, 5d:26, 6d:6, 7d:6, 8d:3, 9d:2, 10d:1

**Notes:** Adjacency guards and slower cooling improved fairness to 13. Short blocks still high — originating from construction.

---

### 004 — Rotation v3: adjacent-preferring pad

**File:** `results/004-rotation-v3-adjacent-pad.json`

**Algorithm:** `padToHeadcount` prefers soldiers on-base yesterday. SA unchanged.

| Metric | Value |
|---|---|
| Headcount violations | 0 / 62 |
| Role violations | **0** |
| Constraint violations | 0 / 26 |
| Fairness variance | 16 (17-33) |
| Short blocks (<4d) | **20.3%** (28/138) |
| Duration | 48ms |

**Block distribution:** 1d:1, 2d:13, 3d:14, 4d:58, 5d:28, 6d:7, 7d:7, 8d:7, 9d:2, 10d:1

**Notes:** Short blocks 26.8% → 20.3%. Fairness regressed 13 → 16 (adjacent preference overrides day-count priority).

---

### 005 — Rotation v4: adjacency-aware fixRoles + right-edge trim + ceil'd onDuration

**File:** `results/005-rotation-v4-adjacent-fixroles.json`

**Algorithm:** Three construction improvements:
1. `onDuration = ceil(...)` (5 vs 4) — more soldiers in window, less padding
2. Right-edge trim — preserves block starts
3. `fixRolesAtHeadcount` prefers adjacent role-holders, avoids removing mid-block soldiers

| Metric | Value |
|---|---|
| Headcount violations | 0 / 62 |
| Role violations | **0** |
| Constraint violations | 0 / 26 |
| Fairness variance | 17 (16-33) |
| Short blocks (<4d) | **12.5%** (16/128) |
| Duration | 50ms |

**Block distribution:** 2d:4, 3d:12, 4d:59, 5d:27, 6d:10, 7d:4, 8d:2, 9d:5, 10d:3, 11d:2

**Notes:** Major jump. Zero 1-day blocks. Adjacency-aware fixRoles was the key improvement.

---

### 006 — Rotation v5: more SA iterations (current)

**File:** `results/006-rotation-v5-more-sa-iterations.json`

**Algorithm:** Same construction as 005. SA: COOLING=0.9995 (~19200 iterations, doubled from 005).

| Metric | Value |
|---|---|
| Headcount violations | 0 / 62 |
| Role violations | **0** |
| Constraint violations | 0 / 26 |
| Fairness variance | **13** (19-32) |
| Short blocks (<4d) | **7.8%** (10/129) |
| Duration | 89ms |

**Block distribution:** 2d:3, 3d:7, 4d:69, 5d:25, 6d:7, 7d:7, 8d:4, 9d:6, 11d:1

**Notes:** Both metrics improved. Short blocks 12.5% → 7.8%. Fairness 17 → 13. More SA budget merged remaining fragments. Duration 89ms, well under target.

---

## Comparison Summary

| Metric | 001 Greedy | 003 Rot v2 | 005 Rot v4 | **006 Rot v5** | Target |
|---|---|---|---|---|---|
| Role violations | 7 | **0** | **0** | **0** | 0 |
| Fairness variance | 20 | **13** | 17 | **13** | < 10 |
| Short blocks | **6.1%** | 26.8% | 12.5% | **7.8%** | < 10% |
| Headcount violations | 0 | 0 | 0 | 0 | 0 |
| Duration | 280ms | 49ms | 50ms | 89ms | < 500ms |

**006 vs 001 (greedy baseline):**
- Role violations: 7 → **0** (fixed)
- Fairness: 20 → **13** (35% better)
- Short blocks: 6.1% → 7.8% (close, within tolerance)
- Speed: 280ms → 89ms (3x faster)
