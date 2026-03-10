# Siddur Miluim — סידור מילואים

Military reserves duty scheduling system. Manages fair rotation schedules for reserve units, handling day-off constraints, role requirements, and city-based grouping.

Hebrew RTL interface. Deployed on Vercel.

## Tech Stack

- **Next.js 16** (App Router, Server Actions, Turbopack)
- **React 19** with TypeScript (strict)
- **PostgreSQL** via Neon serverless (`@neondatabase/serverless`)
- **Prisma 7** ORM with Neon adapter
- **NextAuth.js 5** (beta) — Google OAuth, JWT strategy (no DB hit on auth)
- **Tailwind CSS 4**
- **Zod 4** for validation
- **Vitest** for testing

## Setup

```bash
npm install
cp .env.example .env   # fill in values
npx prisma migrate dev
npm run dev
```

### Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `AUTH_SECRET` | NextAuth secret (`npx auth secret` to generate) |
| `AUTH_GOOGLE_ID` | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |

## Deployment

Hosted on Vercel. Deploy from the project root:

```bash
npx vercel --prod
```

No git remote is configured — deployment is done directly via the Vercel CLI.

## Architecture

```
src/
├── app/                    # Next.js App Router — pages & layouts
├── domain/                 # Pure business logic (no framework deps)
│   ├── schedule/           # Generation, validation, replacement suggestions
│   ├── constraint/         # Day-off constraint grouping
│   ├── soldier/            # Soldier types
│   └── season/             # Season types
├── server/
│   ├── auth/               # NextAuth config (Google OAuth, JWT)
│   ├── actions/            # Server actions (the API layer)
│   └── db/
│       ├── client.ts       # Prisma singleton (Neon adapter)
│       └── stores/         # Data access functions per entity
├── lib/                    # Shared utilities (dates, constants, cities)
├── components/             # Shared React components
└── test/builders/          # Test data builders
```

### Layers

**Domain** (`src/domain/`) — Pure functions, no I/O. Contains schedule generation algorithm, validation rules, and replacement scoring. All domain types live here. This layer has zero dependencies on Next.js, Prisma, or any infrastructure.

**Stores** (`src/server/db/stores/`) — Thin data access functions. Each store maps to a Prisma model. No business logic — just queries. Functions like `getSeasonById`, `getActiveScheduleVersion`, `getConstraintsForSoldier`.

**Server Actions** (`src/server/actions/`) — The API surface. Each action: authenticates via `auth()`, fetches data from stores, runs domain logic, writes results. Returns `{ error?: string; success?: boolean }` for form state. These are the entry points that pages call.

**Pages** (`src/app/`) — `"use client"` pages call server actions on mount/interaction. No direct DB access from pages.

### Key Design Decisions

- **JWT auth with no DB session table** — `auth()` is cheap (token decode only). The bottleneck is always DB queries, not auth.
- **Server Actions over API routes** — All data flows through `"use server"` functions. No REST API.
- **Domain logic is pure** — Schedule generation, validation, and replacement suggestions are pure functions with full test coverage. They receive data, return results.
- **Stores are flat functions, not classes** — Simple `export async function` per query. No repository pattern overhead.

## Database Schema

Core models (see `prisma/schema.prisma` for full schema):

- **User** — NextAuth user (email, name). 1:1 with SoldierProfile.
- **SoldierProfile** — Name, phone, city, roles (`commander`/`driver`/`navigator`), `isFarAway` flag.
- **Season** — A scheduling period. Has `startDate`/`endDate`, `dailyHeadcount`, `roleMinimums`, `constraintDeadline`, `cityGroupingEnabled`, `maxConsecutiveDays`.
- **SeasonMember** — Join table: SoldierProfile + Season + role (`admin`/`soldier`).
- **DayOffConstraint** — Soldier unavailable on a date. Supports `groupId` for multi-day constraint batches.
- **ScheduleVersion** — Versioned schedule (can regenerate, restore old versions). Has `isActive` flag.
- **ScheduleAssignment** — One soldier's assignment for one day. Fields: `isOnBase`, `isUnavailable`, `manualOverride`, `replacedById`.

## Domain Logic

### Schedule Generator (`src/domain/schedule/schedule-generator.ts`)

Generates fair duty rotation schedules. Key behaviors:
- Distributes daily assignments to meet headcount and role minimums
- Respects day-off constraints
- Scores soldiers by fairness (fewer total days = higher priority)
- City-based cohesion bonus (soldiers from same city scheduled together)
- Near/far soldier handling (far soldiers get longer blocks)
- Supports partial regeneration from a specific date (preserves earlier assignments)

### Schedule Validator (`src/domain/schedule/schedule-validator.ts`)

Returns warnings (not errors) for:
- Days below minimum headcount
- Days missing required roles
- Training period violations

### Replacement Suggester (`src/domain/schedule/replacement-suggester.ts`)

When a soldier becomes unavailable, suggests replacements scored by:
- Fairness (fewer assigned days = higher score)
- Role compatibility
- Proximity bonus

## Routes

| Route | Description |
|---|---|
| `/` | Home — season list |
| `/auth/login` | Google OAuth login |
| `/season/new` | Create a new season |
| `/season/[id]/board` | Main schedule board (grid view) |
| `/season/[id]/my-schedule` | Personal schedule for logged-in soldier |
| `/season/[id]/constraints` | Submit day-off constraints |
| `/season/[id]/transitions` | View schedule transitions |
| `/season/[id]/profile` | Edit soldier profile (city, etc.) |
| `/season/[id]/day/[date]` | Daily detail view |
| `/season/[id]/admin/soldiers` | Manage season members |
| `/season/[id]/admin/constraints` | Admin constraint management |
| `/season/[id]/admin/management` | Generate/regenerate/restore schedules |
| `/season/[id]/admin/stats` | Soldier statistics & fairness |

## Testing

```bash
npx vitest run
```

Tests cover domain logic only (pure functions). Test builders in `src/test/builders/` provide factory functions with sensible defaults:

```ts
buildSoldier({ roles: ["commander"], isFarAway: true })
buildSeason({ dailyHeadcount: 8, roleMinimums: { driver: 2 } })
```

4 test files, 25 tests total:
- `schedule-generator.test.ts` — generation fairness, constraints, role coverage
- `schedule-validator.test.ts` — headcount warnings, role minimums
- `replacement-suggester.test.ts` — scoring, role compatibility
- `constraint-grouping.test.ts` — multi-day constraint grouping

## Constants

Soldier roles: `commander` (מפקד), `driver` (נהג), `navigator` (נווט)

Season member roles: `admin`, `soldier`
