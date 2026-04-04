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
- `trimToHeadcount` — excess role-holders removed first (sorted by most days), then rotation window position descending (right-edge first).
- `padToHeadcount` — prefers soldiers on-base yesterday (adjacent = extends block).
- `fixRolesAtHeadcount` — prefers adjacent role-holders, avoids removing mid-block soldiers.

### Refinement (`schedule-refiner.ts`)

- `START_TEMP = 150` — initial SA temperature
- `COOLING = 0.99975` — cooling rate. Lower = more iterations. Currently ~38400 iterations.
- `FAIRNESS_WEIGHT = 300` — cost multiplier for fairness variance
- `BLOCK_PENALTY = 200` — cost multiplier for short blocks
- `HEADCOUNT_PENALTY = 5000` — cost multiplier for headcount violations
- Move types: 10% cross-group swap, 12% within-group fairness swap, 78% general (15.6% transfer, 62.4% normal swap)
- Cross-group swaps: find days with >driverMin drivers, swap excess driver (most days) with off-base non-driver (fewest days). Checks `wouldCreateShortBlock` on removal.
- Fairness swaps: target high-day↔low-day within same role group (driver↔driver, non-driver↔non-driver). Prefer block edges for removal, adjacent positions for addition.
- Normal swap adjacency guard: swap-in must extend an existing block; swap-out must not create a short block

## Known limitations & improvement ideas

- **Fairness floor ~10**: Drivers structurally serve more days (4 mandatory driver slots among 10 drivers = 24.8 days/driver vs 16.5 for non-drivers). The 8-point structural gap plus constraint-driven outliers means variance < 10 is unlikely without role configuration changes. Cross-group swaps (008) reduce the gap slightly but can't overcome the structural minimum.
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
    007-fairness-targeted-sa.json
    008-cross-group-driver-cap.json ← current best
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

### 006 — Rotation v5: more SA iterations

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

### 007 — Fairness-targeted SA (current)

**File:** `results/007-fairness-targeted-sa.json`

**Algorithm:** Two changes targeting fairness:

1. **Construction — excess role-holder trim priority**: `trimToHeadcount` now removes excess role-holders (e.g., 5th driver when minimum is 4) before non-role soldiers, sorted by most days first. Prevents drivers from accumulating extra days through role protection.

2. **SA — within-group fairness swaps**: 15% of SA moves are now "fairness swaps" that target within-group equalization (driver↔driver or non-driver↔non-driver). These bypass adjacency checks but prefer block edges for removal and adjacent positions for addition. COOLING=0.99975 (~38400 iterations, doubled from 006).

| Metric | Value |
|---|---|
| Headcount violations | 0 / 62 |
| Role violations | **0** |
| Constraint violations | 0 / 26 |
| Fairness variance | **10** (20-30) |
| Short blocks (<4d) | **6.3%** (8/126) |
| Duration | 252ms |

**Block distribution:** 2d:4, 3d:4, 4d:66, 5d:27, 6d:8, 7d:7, 9d:5, 10d:2, 11d:1, 12d:2

**Per-role breakdown:**
- Drivers (10): 29-30 days each (spread=1, avg=29.6)
- Non-drivers (15): 20-22 days each (spread=2, avg=21.3)

**Notes:** Major fairness improvement. Driver spread collapsed from 9 (23-32) to 1 (29-30). Overall variance 13 → 10. Short blocks also improved: 7.8% → 6.3%. The remaining 10-point variance is structural: with 4 driver slots among 10 drivers (24.8d/driver), the minimum gap vs non-drivers (16.5d) is ~8. The extra 2 points come from עמית פאר having 11 constraints.

---

### 008 — Cross-group driver capping (current)

**File:** `results/008-cross-group-driver-cap.json`

**Algorithm:** Two changes targeting driver/non-driver variance:

1. **Construction — `capExcessDrivers`**: New step between `trimToHeadcount` and `padToHeadcount`. For each day with more than `roleMinimum` drivers, excess drivers (sorted by most days, block-edge preferred) are replaced with non-drivers (fewest days, adjacent preferred). Maintains headcount exactly. Guards against breaking role minimums for multi-role soldiers.

2. **SA — cross-group balance move**: 10% of SA moves are now "cross-group swaps" that target days with >driverMin drivers. An excess driver (most days, block edge) is swapped with an off-base non-driver (fewest days, adjacent). Guards: `driver.days > nonDriver.days + 2`, `wouldCreateShortBlock` check on removal. SA move distribution: 10% cross-group + 12% within-group fairness + 78% general (was 15% fairness + 85% general).

**Skipped:** Group-aware SA cost function (dual intra/inter-group weights) was tested but reverted — even minimal intra-group weights destabilized SA dynamics, doubling short blocks regardless of tuning.

| Metric | Value |
|---|---|
| Headcount violations | 0 / 62 |
| Role violations | **0** |
| Constraint violations | 0 / 26 |
| Fairness variance | **10** (20-30) |
| Short blocks (<4d) | **3.9%** (5/127) |
| Duration | 275ms |

**Block distribution:** 2d:1, 3d:4, 4d:68, 5d:32, 6d:4, 7d:7, 8d:3, 9d:7, 10d:1

**Per-role breakdown:**
- Drivers (10): 29-30 days each (spread=1, avg=29.5)
- Non-drivers (15): 20-24 days each (spread=4, avg=21.4)
- Inter-group gap: 8.1, excess driver-slots: 0

**Notes:** Short blocks cut nearly in half (6.3% → 3.9%). Excess driver-slots eliminated (1 → 0). Inter-group gap reduced (8.3 → 8.1). Non-driver spread widened from 2 to 4 (יונתן רוזנברג [commander] at 24d absorbs extra days from cross-group swaps), but overall variance unchanged at 10.

---

## Comparison Summary

| Metric | 001 Greedy | 003 Rot v2 | 006 Rot v5 | 007 Fairness SA | **008 Cross-group** | Target |
|---|---|---|---|---|---|---|
| Role violations | 7 | **0** | **0** | **0** | **0** | 0 |
| Fairness variance | 20 | **13** | **13** | **10** | **10** | < 10 |
| Short blocks | **6.1%** | 26.8% | 7.8% | 6.3% | **3.9%** | < 10% |
| Headcount violations | 0 | 0 | 0 | 0 | 0 | 0 |
| Duration | 280ms | 49ms | 89ms | 252ms | 275ms | < 500ms |

**008 vs 007:**
- Short blocks: 6.3% → **3.9%** (38% fewer)
- Excess driver-slots: 1 → **0** (eliminated)
- Inter-group gap: 8.3 → **8.1** (slightly improved)
- Non-driver spread: 2 → 4 (wider, but overall variance unchanged)
- Duration: 252ms → 275ms (comparable)

**008 vs 001 (greedy baseline):**
- Role violations: 7 → **0** (fixed)
- Fairness: 20 → **10** (50% better)
- Short blocks: 6.1% → **3.9%** (36% better)
- Speed: 280ms → 275ms (comparable)
