# Spike: recently-saved grinds on the home page

Status: **decided 2026-09-04**, ready to build. No code written yet.

## Decided

- **B1** - server-query the existing `boards` collection, no new
  collection/field. Public feed (see "the design tension" below).
- **Count: 5**, not 10.
- **No filtering** - blank / never-named boards are listed too.
- **Query is a projection**: `.select('name', 'shareId', 'updatedAt')` so
  the (potentially large) `flows`/`flowOrder` fields never leave Firestore
  for a query that only needs three fields. Doesn't change Firestore's
  billed read count (still one read per result doc), just cuts payload
  size/server memory.
- **Unnamed-board fallback uses `shareId`, not `boardId`.** Everywhere
  else, `board.name || \`Board ${boardId}\`` is safe because it only
  renders for someone who already holds the edit URL. On the home page it
  would render for the entire public *before* they have any link - an
  unnamed board's fallback text would otherwise hand out its edit
  capability. Fallback here is `board.name || \`Board ${shareId}\`` -
  same look, only grants the read-only access the row's link already
  grants anyway.

See "Options" below for the full B1/B2/B3/A comparison this came out of.

## What's being asked

The home page (`src/routes/+page.svelte`, currently just a "Create new
board" button) should list the 5-10 most recently saved boards. Each row =
board name + a link to its read-only `/s/[shareId]` view, never the
editable `/b/[boardId]` URL.

## The design tension - read this first

The access model (`DESIGN.md` "Access model") is deliberate: no board is
discoverable, capability URLs only, "no sharing = no risk." A home page
that lists boards to every visitor is a new public surface that section
never contemplated. There are two readings of the request and they need
different builds:

1. **My history** - "show me boards *this browser* has worked on so I can
   get back to them." Consistent with the no-accounts model. Needs no
   server state.
2. **A public feed** - "show the site's recent activity to anyone who
   loads the home page." Turns the app into a public directory of
   everyone's boards, each with a working read-only link. Probably fine
   for a hobby OSRS tool with a tiny user base, but still a conscious
   reversal of a stated principle, and it wants a `DESIGN.md` update.

Decide which one this is before anything else - everything below forks on it.

## What already exists and helps

- Every board has `updatedAt` (`FieldValue.serverTimestamp()`), bumped on
  every mutation in `+page.svelte`.
- Every board has a `shareId`; `/s/[shareId]` is already a server-rendered
  read-only view that never exposes `boardId`.
- `shareLinks/{shareId}` -> `{ boardId }` mapping already exists.
- A recents list therefore only ever needs to surface `{ name, shareId }`.
  The read-only-link half of this feature is basically free.

## Options

### A - per-device recents in `localStorage` (no server change)

On the board page, on load/save, upsert `{ shareId, name, ts }` into a
capped (10) `localStorage` list, deduped by `shareId`, oldest dropped.
Home page reads it client-side and renders the links.

- No new collection, no new field, no rules change, no privacy change.
- Only shows boards this browser has visited - but the app already works
  this way (you bookmark URLs per device).
- Lost on clear-site-data. Home list is client-rendered only (an SSR
  `load` can't see `localStorage`).
- Most consistent with the existing model. Lowest cost.

### B1 - server-query the existing `boards` collection (minimal server option)

Home `+page.server.ts` gains a `load` using the Admin SDK:
`boards.orderBy('updatedAt', 'desc').limit(5).select('name', 'shareId', 'updatedAt').get()`,
return `[{ name, shareId }]` (fallback to `Board ${shareId}` when unnamed -
see "Decided"). The client never queries Firestore; `boards` rules
(`allow list: if false`) stay as-is (the Admin SDK bypasses them);
`boardId` never leaves the server.

- **No schema change** - `updatedAt` + `shareId` already suffice. The
  "new field or collection" instinct isn't actually required for this path.
- Global feed (see tension #2).
- `updatedAt` bumps on every toggle/rename, so the list churns constantly
  and "saved" really means "last touched by anyone."
- Single-field `orderBy('updatedAt', 'desc')` is covered by Firestore's
  automatic single-field indexes - no `firestore.indexes.json` needed.

### B2 - dedicated `recentBoards` collection

`recentBoards/{shareId}` = `{ name, shareId, updatedAt }`. Home `load`
queries this instead of `boards`. Written from the board page on save.

- Decouples the public feed from the private `boards` collection - you
  control exactly what gets listed (skip blanks, throttle the timestamp).
- Costs an extra write on every board mutation. Options: a shared helper
  wrapping the ~8 `updateDoc` sites; route mutations through a server
  action; or (simplest) only upsert `recentBoards` on **create + rename**,
  which makes it "recently created" rather than "recently saved."
- No Cloud Functions in this project, so a Firestore trigger to maintain
  the collection is a bigger infra add than it's worth right now.
- Denormalized `name` stays fresh because rename is itself a mutation.
- Rules: `allow read, write: if false` (server-only, like `shareLinks`);
  the home `load` does the read, board-page writes need a server hop (or
  relax writes with a validator).

### B3 - explicit opt-in (`listed` flag)

A board appears in recents only after the owner toggles "list on home
page." Adds a `listed: boolean` field + a `recentBoards` doc written /
removed on toggle.

- Fully preserves the capability model: nothing is discoverable unless
  chosen.
- Most new UI. Probably over-scoped for a first iteration unless the
  public-feed concern is an actual blocker.

## Remaining open question

- "Recently saved" = every mutation, so the list churns with every toggle
  (this is what B1 gives you, since it orders by the existing `updatedAt`
  which every mutation bumps). Accepted as-is per "Decided" - not worth
  the extra plumbing of B2/B3 just to stabilize the ordering.
- Delete cleanup: a deleted board's `/s/[shareId]` already 404s
  (shareLinks cleanup, commit `86b9b4a`), and since B1 queries `boards`
  directly rather than a denormalized copy, a deleted board simply stops
  appearing in the next query - no extra cleanup needed.
