# OSRS Grind — Design Doc

Living reference for decisions made before/during early build-out. Update this
as decisions change; this file is the source of truth across sessions, not
chat history.

## What this is

A tool for tracking Old School RuneScape "grinds" — things you're working
toward (skill levels, boss/monster kill counts, minigame rewards) that unlock
other things (items, abilities, access). Grinds are rarely a flat list: doing
skill A and skill B unlocks boss C, which drops items D and E, etc. The app
visualizes and tracks these as dependency chains.

Direct inspiration: [Ladlor's Ironman Progression
Chart](https://ladlorchart.com/) and ZeroUltra's PvM Exploration Chart —
both static, single-author, single-path flowcharts. This app differs in that
it's dynamic (user-editable, not curated by one person) and supports many
small independent chains rather than one master path.

## Domain model

- **Board** — the top-level container behind one shareable URL. Holds one or
  more **flows**.
- **Flow** — one independent grind chain/graph (e.g. "PvM Grind", "Blue Moons
  chain"). Flows on a board are unrelated to each other. No categories/
  grouping layer yet (may add later if useful — see Deferred).
- **Node** — one atomic thing within a flow: a skill, a boss/monster, an
  item, or a minigame. Never a bundle of multiple things.
- **Edge** — a directed link between two nodes showing "this feeds into
  that." A node can have multiple incoming edges (fan-in — e.g. two skills
  required for one boss) and multiple outgoing edges (fan-out — e.g. one
  boss dropping multiple tracked items).
- **Node state** — a single boolean: done / not done. No enforcement logic —
  edges are purely visual/organizational. You can toggle any node regardless
  of the state of its neighbors, skip things, or mark something done out of
  order. No AND/OR unlock rules.

## Layout & interaction

- Each flow auto-lays-out from its graph structure (layered, left-to-right,
  similar visual language to the inspiration charts) — no free node
  dragging in v1.
- Drag is supported at the board level only: reordering whole flows relative
  to each other (basic prioritization), not repositioning nodes within a
  flow.
- Must work equally well on mobile web and desktop browser. This ruled out
  desktop-whiteboard-style graph libraries (e.g. React Flow) in favor of
  auto-computed layout rendered as plain responsive SVG/HTML — no pinch/pan
  gesture handling to build.

## Access model

- No accounts, no login/password.
- Each board is addressed by a random, unguessable ID (capability URL) —
  same pattern as Excalidraw/Figma share links. Bookmark the URL on each
  device to access/edit the same board.
- Anyone with the link can edit. No sharing = no risk; brute-forcing the ID
  space is an accepted non-goal.
- Future (not v1): shareable **templates** — a board can be published as a
  template that others fork into their own fresh random-ID board.

## Data sourcing

- Node data (items, monsters, skills, icons) will be scraped from the OSRS
  Wiki. Scraping approach TBD, not needed for early scaffolding.
- The app never connects to or syncs with a player's actual live game
  account/data. All progress is manually toggled by the user.

## Deferred (explicitly not v1)

- Categories/grouping of flows on a board.
- Node tags/flags (e.g. optional/low-priority), inspired by ZeroUltra's
  color-coded legend.
- A third "skipped" node state (currently just done/not-done).
- Free-text notes per node.
- Templates / multi-user forking.

## Stack

- **Frontend/app**: SvelteKit, TypeScript, `adapter-node`.
- **Hosting**: Cloud Run (containerized SvelteKit server). Chosen over
  Firebase Hosting because SvelteKit support there runs through an
  experimental "web frameworks" integration; Cloud Run + `adapter-node` is a
  plain, predictable Node server.
- **Database**: Firestore, **Native mode** (not Datastore mode) — chosen for
  built-in realtime listeners, useful for near-live sync across devices.
- **Auth to GCP**:
  - Local dev: Application Default Credentials (`gcloud auth
    application-default login`) — no key files to manage or leak.
  - Production (Cloud Run): the Cloud Run service's attached service
    account — also no key files.
- **Package manager**: npm.
- **Lint/format**: ESLint + Prettier.
- **Testing**: none yet. Revisit when the flow auto-layout algorithm is
  built — that's genuinely fiddly pure logic worth unit-testing (Vitest).
  Everything else (UI, Firestore reads/writes) is small enough for manual
  testing for now.
- **CI**: none yet. Add a basic GitHub Actions lint/typecheck workflow once
  there's a test suite worth running in CI.

## Infrastructure already provisioned

- GCP project: `osrs-grind` (billing linked to "My Billing Account").
- GitHub repo: `mattlovedev/osrs-grind` (private).
