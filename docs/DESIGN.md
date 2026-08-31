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
- **Node** — one cell in a flow's graph; what edges actually connect to/from.
  A node holds one or more **entries** (see below). Whether to split
  something into its own node or group it into an existing one is a
  per-grind authoring choice, not a fixed rule — e.g. two skills required
  for one boss can be modeled as two single-entry nodes with two converging
  edges, or grouped into one node with one edge out, if you don't need to
  distinguish them individually.
- **Entry** — one atomic thing inside a node: a skill, a boss/monster, an
  item, or a minigame. Has its own independent done/not-done state, even
  when grouped with other entries in the same node (e.g. a 4-item node
  where some entries are done and others aren't).
- **Edge** — a directed link between two _nodes_ (never between individual
  entries) showing "this feeds into that." A node can have multiple
  incoming edges (fan-in — e.g. two nodes required for one boss node) and
  multiple outgoing edges (fan-out — e.g. one boss node leading to multiple
  item nodes).
- **Entry state** — a single boolean: done / not done. No enforcement logic —
  edges are purely visual/organizational. You can toggle any entry
  regardless of the state of its neighbors, skip things, or mark something
  done out of order. No AND/OR unlock rules.

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
- **Visual styling entirely.** Building for functionality only right now —
  unstyled/minimally-styled markup is fine. Styling for both desktop and
  mobile web is a deliberate later pass, not an ongoing concern during
  feature build-out.

## Roadmap — graph UI (not started)

Data layer is done and verified (see Infrastructure section below). The
graph UI is the next major chunk of work, intentionally taken slowly and
step by step rather than all at once. Planned order:

1. **Auto-layout algorithm** — pure logic: given a flow's nodes/edges,
   compute layered left-to-right positions. Worth actual Vitest unit tests
   (see Stack section) since this is the fiddliest pure-logic piece.
2. **Read-only rendering** — render one flow (nodes with their entries,
   arrows between nodes) from the layout output, using seed data. Proves
   the visual side before wiring up editing.
3. **Entry toggle** — click an entry to flip done/not-done, written
   straight to Firestore.
4. **Editing** — add/remove nodes, entries, and edges. The actual authoring
   UI; the biggest piece of this list.
5. **Multiple flows per board** — render several flows on one board, plus
   the board-level drag-to-reorder (see Layout & interaction section).

Each step should get its own focused session rather than being rushed
through — update this list's status as steps complete or the plan changes.

## Data model (Firestore)

One document per board — no subcollections. A board embeds all of its flows,
nodes, and entries directly:

```
boards/{boardId}
{
  updatedAt: Timestamp,
  name: string,                    // blank by default; client falls back
                                    // to showing the board ID when blank
  flowOrder: [flowId, ...],        // controls board-level drag-to-reorder
  flows: {
    [flowId]: {
      name: string,
      nodes: {
        [nodeId]: {
          entries: {
            [entryId]: {
              type: "skill" | "boss" | "item" | "minigame",
              label: string,       // manual text for now; wikiRef reserved
                                    // for later once wiki scraping exists
              done: boolean
            }
          }
        }
      },
      edges: {
        [edgeId]: { from: nodeId, to: nodeId }   // node-to-node only
      }
    }
  }
}
```

Why this shape:

- **Single document, not subcollections.** One realtime listener gives the
  whole board reactively, and it's cheaper (Firestore bills per document
  read). Tradeoff: 1MiB document size cap — generous for a personal board,
  worth revisiting if this goes multi-user/community-scale later.
- **Maps keyed by ID, not arrays**, for flows/nodes/entries/edges. This
  matters for realtime multi-device editing: a targeted field write like
  `flows.<flowId>.nodes.<nodeId>.entries.<entryId>.done` can't clobber a
  concurrent edit from another device the way rewriting a whole array could.
- **No `position` field anywhere.** Layout is always derived from the graph
  structure (nodes + edges) at render time, never stored — matches "no free
  node dragging in v1."
- **Board `name` defaults blank, not to the ID.** The client displays
  `name || boardId` as a fallback rather than writing the ID into the name
  field at creation — keeps "no custom name set yet" distinguishable from
  "named the same as its ID." Editable via a click-to-edit form on the
  board page (click the heading, type, hit Enter).

## Backend architecture

No traditional backend API/service. Instead, a hybrid:

- **Initial page load (SSR)**: SvelteKit server (`+page.server.ts`, Firestore
  Admin SDK) fetches the board doc server-side for a fast first paint with
  no loading spinner — important for mobile.
- **After load**: the browser switches to the **Firebase Web SDK**, talking
  directly to Firestore for all reads/writes and realtime listening. This is
  what gives cross-device sync (edit on desktop, see it update on phone)
  without any server round-trip or custom API.
- Access control is enforced by **Firestore Security Rules**, not
  server-side auth — rules just check "does the request carry the right
  board ID," matching the capability-URL model. No REST API to design; the
  "backend" is effectively Firestore + its rules. Security rules are the one
  piece here worth extra care, since a mistake there is the gap between
  "unguessable URL" and "world-writable database."
- All code (SSR server logic and client Firestore logic) stays TypeScript in
  the single SvelteKit repo — no separate backend service/language.

## Stack

- **Frontend/app**: SvelteKit, TypeScript, `adapter-node`.
- **Hosting**: Cloud Run (containerized SvelteKit server). Chosen over
  Firebase Hosting because SvelteKit support there runs through an
  experimental "web frameworks" integration; Cloud Run + `adapter-node` is a
  plain, predictable Node server.
- **Database**: Firestore, **Native mode** (not Datastore mode) — chosen for
  built-in realtime listeners, useful for near-live sync across devices.
- **Local dev uses the Firestore Emulator, not live data.** Run `npm run
emulator` alongside `npm run dev` — both the client Web SDK
  (`connectFirestoreEmulator`) and server Admin SDK (`FIRESTORE_EMULATOR_HOST`)
  auto-connect to it when SvelteKit's `dev` flag is true, so local testing
  never touches real boards. Ports: Firestore 8080, emulator UI 4000 (see
  `firebase.json`). Security rules load straight from `firestore.rules` on
  emulator startup, so rule changes are testable locally without deploying.
- **Auth to GCP**:
  - Local dev: not required day-to-day anymore, since the emulator doesn't
    check credentials. Application Default Credentials (`gcloud auth
application-default login`) are still needed for one-off scripts that
    touch real production data (e.g. the cleanup scripts used to verify the
    plumbing during initial setup).
  - Production (Cloud Run): the Cloud Run service's attached service
    account — no key files.
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
- Firestore database: Native mode, region `us-central1` (permanent choice —
  changing region later requires recreating the database).
- Firebase registered on the project, with one Web App (`osrs-grind-web`,
  App ID `1:549755295105:web:b5493d369c62ab49b0c480`). Its SDK config
  (apiKey, authDomain, etc.) is safe to commit/embed client-side — it's not
  a secret, access is controlled by Firestore Security Rules, not by hiding
  this config. Not yet wired into the app.
- Firestore Security Rules: deployed (`firestore.rules`). `get` open to
  anyone with a board's exact ID, `list` denied (load-bearing for the
  capability-URL model — prevents enumerating all boards), `create`/`update`
  require top-level shape validation, `delete` disabled for now (not a
  feature yet, easy to open up later).
- End-to-end plumbing wired and verified: `/` has a `createBoard` form
  action (Admin SDK, generates a `nanoid` board ID, redirects to
  `/b/[boardId]`); `/b/[boardId]` SSRs the board via Admin SDK (404s if
  missing) then hands off to the Firebase Web SDK client-side for realtime
  `onSnapshot` sync, with a test "add flow" button proving writes go through
  the deployed security rules. No graph UI yet — this only proves the data
  layer works.
