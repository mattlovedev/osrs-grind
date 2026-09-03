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
- **Entry** — one atomic thing inside a node. Has its own independent
  done/not-done state, even when grouped with other entries in the same
  node (e.g. a 4-item node where some entries are done and others aren't).
  Fields: `label`, `wikiLink`, `icon`, `bottomText`, `done`.
  - **`bottomText`** is the visible caption under the icon (e.g.
    "77 Smithing", "1k steel bars") — free text now, replacing the old
    type-specific level/quantity prompts. Not to be confused with the
    Deferred "free-text notes per node" (which would be hidden until
    expanded); this one always shows.
  - **No `type` field.** Entries used to carry
    `skill`/`boss`/`item`/`minigame`; dropped once creation became one
    global search rather than per-category menus, and rendering became
    uniform. The catalog / `/api/search` still expose `type` (for the
    result-list badge) — re-add to `Entry` later if boss-drop filtering or
    colour-coding wants it.
  - **Catalog-backed creation with per-entry overrides (built
    2026-09-01).** A single centred modal: an **identity search** over
    `/api/search` sets `label`, `wikiLink`, `icon` from the picked catalog
    result; the form's icon field opens a second **icon-only search** that
    overwrites just `icon` (label/wikiLink untouched) — for cases like a
    "Blue Moon armor set" entry borrowing the "Blue Moon staff" icon. The
    same modal, pre-filled, edits an existing entry in place. An entry is
    self-contained data (`label`/`icon`/`wikiLink` copied onto it, not live
    references), so overrides never touch the shared catalog or other
    boards.
- **Edge** — a directed link between two _nodes_ (never between individual
  entries) showing "this feeds into that." The data model supports a node
  having multiple incoming edges (fan-in) and multiple outgoing edges
  (fan-out — e.g. one boss node leading to multiple item nodes), matching
  the original "two skills into one boss, one boss into two drops" vision.
  **Current UI restriction (2026-08-31):** the connect-arrow button only
  appears on tail nodes (nodes with no outgoing edge yet), so fan-out
  can't actually be created right now — deliberately simplified since the
  renderer only draws a straight nodeOrder-sequence line and would
  misrepresent real branching. Fan-in was never blocked (a node can still
  receive edges from elsewhere) but nothing in the current build creates
  that either. Revisit both once real edge-based layout exists.
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

## Data sourcing & catalog (major direction decided 2026-09-01)

The app never connects to or syncs with a player's actual live game
account/data — all progress is manually toggled by the user. Everything
below is about _reference_ data (what skills/bosses/items exist, their
names/icons/wiki links), not player data.

**Where the data actually comes from.** Originally assumed the wiki ran on
Cargo (a common MediaWiki structured-query extension) — wrong, verified via
`Special:CargoTables` 404ing. What it actually runs is a Weird Gloop-built
extension called **Bucket** (`action=bucket` in the API, query docs at
`meta.weirdgloop.org/w/Extension:Bucket`), which exposes real structured
tables including:

- `Bucket:Dropsline` — fully structured drop data per monster (name,
  rarity, quantity, drop value) as clean JSON. No wikitext template
  regex-parsing needed.
- `Bucket:Collection_log_source` — ~1,712 entries mapping items to their
  collection-log source (Jagex's own in-game curation of notable
  per-activity rewards). Used as a catalog _coverage_ source and a future
  ranking signal, not a filter (see Notability below).
- `Bucket:Infobox_monster` / `Bucket:Infobox_item` — structured
  monster/item data, including image references (item pages declare their
  icon explicitly via `|image = [[File:X.png]]` in their infobox — verified
  for Amulet of fury — so icon resolution can read the wiki's own declared
  filename instead of guessing a naming pattern, which already burned us
  once: `Inventory_tab.png` turned out to be a 204×275 screenshot of the
  whole panel, not the 25×27 backpack icon we wanted).
- `Bucket:Recipe` — the source for skill-derivable items (spiked
  2026-09-01). Its `production_json` blob per row carries
  `output {name, image, cost}` + `skills [{name, level, experience}]` +
  materials — so output item name, icon, and the gating skill/level all
  come structured, no wikitext parsing. ~3,977 rows have a real output
  item, ~2,808 with a numeric level. `.where("uses_skill","Crafting")`
  chunks it by skill (794 rows for Crafting). Rows with `output: ""`
  (agility courses, quest steps) filter out.

**Bucket caps every query at 5,000 rows**, and `where` only takes a single
scalar — no `OR` / `IN` / array. `.offset(N)` works, so paginate with
limit+offset, or chunk by a `.where(...)` that stays under (per-skill for
recipes). This makes bulk-then-filter-locally the pattern for icon
resolution: `Infobox_item` is only ~16.8k rows, so paging the whole table
(4 requests) and building a `page_name → image` map beats one `.where`
lookup per item — the map is cached to `scripts/.data/infobox-items.json`
so re-runs do no wiki traffic. A bucket's schema is readable at its
`Bucket:<Name>` page. There is **no** skill / level-up / unlock bucket —
checked the full `Bucket:` namespace; the per-skill "X/Level up table" wiki
pages are `{{Level up table}}` wikitext (item `{{plink}}`s mixed with
prose), which is why `Bucket:Recipe` wins over parsing those.

**Scope, phased:**

1. **Bosses first.** `Category:Bosses` = 341 pages, a clean bounded scope
   matching what people actually grind for (`Category:Monsters` blows past
   several thousand once every low-level variant is counted — explicitly
   not the target). This is the de-risked phase: every mechanical piece
   (enumeration, drop data, icon resolution) has been verified to work.
2. **Skill-derivable items second** — items you craft/smith/fletch/brew
   rather than get as drops (e.g. Amulet of fury via Crafting). Source is
   `Bucket:Recipe` (see above; the level-up-table idea was dropped —
   they're not in Bucket and the wikitext is prose-heavy). Not a distinct
   catalog phase anymore — just another item source unioned into the flat
   list (roadmap stage 2c). Recipe misses "wield-to-use" gates like Dragon
   axe at 61 Woodcutting, but those are drops / collection-log items
   already.
3. **Manual entries remain a valid fallback throughout** — anything not yet
   covered by either scrape can still be hand-added the way Amulet of fury
   was. The catalog grows incrementally; it never needs to be "complete" to
   be useful.

**Notability: include broadly, don't gate (revised 2026-09-01).** The
original plan was a filtering pass that removed generic drops — excluding
known-generic sections (`Tertiary`, `Rare and Gem drop table`, `100%`),
frequency analysis across the scraped dataset (an item in only 1-3 bosses'
tables is probably boss-specific; one in dozens is common loot), with
`Bucket:Collection_log_source` as the primary "real grind target" signal.
Abandoned as a gate after the first real run: Dagannoth Rex processed to 44
of 77 drops still flagged "notable," and no reasonable blocklist trims that
toward the ~4 items (Berserker ring, Warrior ring, Dragon axe, pet) people
actually camp him for — a blocklist only removes what you think to name.

The reframe: for a search-backed catalog, **recall beats precision**.
Nobody types "Prayer potion(2)" into the entry search, so its presence
costs nothing; a _missing_ Berserker ring is a real defect. The catalog
includes every item it can enumerate, with no notability gate. The
`Collection_log_source` and `Recipe` signals don't disappear — they change
role:

- **Coverage.** Drop tables miss anything not dropped (crafted/smithed
  items like Amulet of fury). `Bucket:Recipe` catches those;
  collection-log-source catches notable untradeables and pets. Each is an
  additional _source_ feeding the same deduped item list, not a filter
  over it.
- **Ranking (deferred).** Membership in a collection log, or a recipe with
  a high level requirement, is a good "marquee item" signal for ordering
  search results so Berserker ring sorts above Prayer potion. Not needed to
  ship — layer it on once the catalog and search box exist.

**Boss→item association dropped (2026-09-01).** Earlier drafts stored drops
nested under each boss with rarity/quantity/value. The app doesn't need to
know which boss drops which item at this stage — the drop tables are just a
convenient way to enumerate (1) every boss and (2) a large chunk of every
item. The generated catalog is flat deduped lists; the association and the
per-drop metadata are discarded. Stage 1's raw per-boss files still keep
everything, so associations can be reconstructed later without re-fetching
if a feature ever needs them.

**Output shape** — one catalog file plus downloaded icons, checked into the
repo, no runtime wiki dependency after generation:

```
src/lib/data/catalog.json          (imported as $lib/data/catalog.json)
{
  "generatedAt": "...", "source": "...", "counts": { ... },
  "skills":    [{ "name": "Crafting",      "wikiLink": "...", "icon": "/icons/skills/crafting.png" }],
  "bosses":    [{ "name": "Dagannoth Rex",  "wikiLink": "...", "icon": "/icons/bosses/dagannoth-rex.png", "combatLevel": 303 }],
  "monsters":  [{ "name": "Lizardman shaman", "wikiLink": "...", "icon": "/icons/monsters/lizardman-shaman.png", "combatLevel": 150 }],
  "items":     [{ "name": "Berserker ring", "wikiLink": "...", "icon": "/icons/items/berserker-ring.png" }],
  "minigames": []
}
```

`icon` is the local `/icons/...` path, or `null` if that icon wasn't
downloaded (frontend shows a placeholder — no wiki hotlinking at runtime).

`skills` is a static hand-written list of all 24 (includes Sailing).
`bosses` comes from `Category:Bosses` + `Infobox_monster`. `monsters` is
regular (non-boss) Slayer-assignable monsters — see "Slayer-task monsters"
below. `items` is the deduped union of every source: drop tables,
collection-log-source, `Bucket:Recipe`, and (added 2026-09-02) the full
`Infobox_item` table itself — see the item-count note under Roadmap step
1's stage 2c bullet. `minigames` source is still TBD.
Icon files are downloaded to the paths shown, filenames normalized to
kebab-case (not the wiki's raw "Dagannoth Rex.png" with spaces/casing).

**Slayer-task monsters (added 2026-09-03).** A regular monster like
Lizardman shaman was previously invisible to search entirely — `bosses`
only covers `Category:Bosses` (173 real articles once non-namespace-0
category members are filtered out - see `fetchAllCategoryMembers`), and
`Category:Monsters` was ruled out early on as too broad
(see Scope above). `Category:Slayer monsters` turned out to be the right
middle ground: a curated, wiki-maintained list of exactly the monsters
worth tracking as grind targets (686 pages), small enough to enumerate the
same way as bosses. Stages 0-1 now union `Category:Bosses` and
`Category:Slayer monsters` into one shared fetch (a page in both, e.g.
Vorkath, is only fetched once, tagged `source: ["boss", "slayer"]`) —
see `scripts/lib/monster-categories.mjs`. Stage 4 keeps `bosses` exactly
as `Category:Bosses` and puts everything else in `monsters`, so a
dual-category page shows up once, as a boss, not twice. A page with no
`Infobox_monster` row at all (category-overview articles like "Slayer
monsters" itself, task-tip guide pages) is skipped outright rather than
written as a stub.

Two bugs surfaced going from ~173 to ~786 candidate pages, both fixed the
same day:

- **Slug collisions.** Two distinct, real, non-redirect wiki pages can
  kebab-slugify to the same string — "Skeleton (mage)" and "Skeleton
  Mage" both -> `skeleton-mage`. Stage 1 names each cache file
  `raw/<slug>.json`, so an undetected collision meant one page's data
  silently overwrote the other's on disk (lost the entry, not just its
  icon). Stage 0 now assigns every title a unique slug up front,
  disambiguating with a numeric suffix (`skeleton-mage-2`) rather than
  dropping either page — recall over precision, same stance as the item
  catalog. Stage 1 also checks title (not just revision timestamp) before
  reclaiming a cached file, so a slug that gets reassigned between runs
  can't reclaim the wrong page's data.
- **Duplicate display names crashed the search UI.** Unlike items, the
  bosses/monsters catalog doesn't dedupe by display name — genuinely
  distinct wiki pages (location variants like the 14 different "Skeleton"
  pages, or mode variants like "Dagannoth Rex (Deadman)") can share the
  same in-game name. `EntryModal.svelte`'s results list was keyed on
  `type + name`, which crashed Svelte's keyed `{#each}` outright
  (`each_key_duplicate`) once two monster results shared a name — not
  just cosmetic duplication, a fatal render error that broke search
  entirely. Fixed by keying on `type + wikiLink` instead, which is always
  unique. Whether to actually dedupe same-named catalog entries (currently
  57 names, ~100 extra rows) is tabled, not decided — search still works
  either way now, it just shows every variant.

**Icons: served from `static/`, regenerated not committed (revised
2026-09-01).** SvelteKit serves `static/` automatically in both `npm run
dev` and the deployed container, so that's where the icons live. The first
full run produced ~4,800 files / ~30 MB — and committing that was a
mistake: git stores every version of every binary in full, so each
re-scrape that changes icons would bloat history permanently. So
`static/icons/` is **gitignored**; `scripts/03-download-icons.mjs`
regenerates it (fast — skips files already on disk). `src/lib/data/
catalog.json` (~800 KB text) _is_ committed. Open item for deployment: the
Docker build needs the icons — either run stage 3 (or `npm run scrape`) as
a build step, or pull a pre-built bundle from a Release asset / GCS.
Git LFS is the other option if a build-step fetch proves annoying.

**Scraper tooling lives in `scripts/`**, meant to be re-run repeatedly as
the catalog grows/changes (not a one-time throwaway) — distinct from the
`scripts/tmp-*.mjs` pattern used elsewhere in this doc's history for
one-off manual verification during feature testing, which get deleted
after use.

## Deferred (explicitly not v1)

- Categories/grouping of flows on a board.
- Node tags/flags (e.g. optional/low-priority), inspired by ZeroUltra's
  color-coded legend.
- A third "skipped" node state (currently just done/not-done).
- Free-text notes per node.
- Templates / multi-user forking.
- **Visual styling, except the board detail page.** The home page (`/`)
  stays unstyled/functionality-only for now. The board detail page
  (`/b/[boardId]`) styling is active work as of 2026-08-31 — scoped to that
  page only (no shared/global stylesheet yet), light theme, not
  mobile-responsive for this pass. Component look-and-feel is user-directed
  rather than proposed. Update this note again if/when scope changes
  further (e.g. once the home page or a global stylesheet gets its own
  pass).
- Mobile-responsive styling — deferred even though the underlying
  interaction model (auto-layout, no free dragging) was already chosen to
  make mobile support straightforward later. Styling itself hasn't been
  made responsive yet.

## Roadmap — graph UI (superseded, kept for history)

This was the original plan for building the graph UI, written before any of
it existed. **What actually happened diverged from the planned order** — no
separate auto-layout algorithm was ever built (layout is plain CSS grid/flex,
not a computed algorithm); read-only rendering and editing were built
together incrementally rather than as separate phases; entry toggle, editing
(add/delete at entry/node/flow level), and multi-flow boards are all done,
just not in this sequence or shape. Keeping the original list below for
context on the original thinking, not as a live plan — see the **Roadmap —
catalog & search** section for what's actually next.

1. ~~Auto-layout algorithm~~ — never built as a separate thing; layout is
   direct CSS (2-row column-major grid for entries within a node, flex row
   for nodes within a flow), not a computed algorithm.
2. ~~Read-only rendering~~ — done, but interleaved with editing rather than
   built first in isolation.
3. ~~Entry toggle~~ — done (click an entry outside edit mode to flip
   done/not-done; light green fill when done).
4. ~~Editing~~ — done: add entries to nodes, connect new nodes via edges,
   delete at all three levels (entry/node/flow) with cascading rules, all
   gated behind an explicit edit-mode toggle.
5. ~~Multiple flows per board~~ — done (unrestricted number of flows,
   board-level flow delete). Drag-to-reorder flows was never built — not
   needed yet at the scale actually used.

## Roadmap — catalog & search (current, active)

The live plan as of 2026-09-01. Feature work on the board UI itself is
paused for this — see Data sourcing & catalog and Backend architecture
above for the full reasoning behind each step. Order matters here: each
step is validated before the next depends on it.

1. **Build the scraper(s) in `scripts/`** — re-runnable tools (not
   one-shot), querying the wiki's Bucket API. Start small: validate against
   just the 2 bosses already hand-curated (Dagannoth Rex, Dagannoth Prime)
   and confirm the scraper reproduces the same drops before scaling up.
   Staged as separate, independently re-runnable scripts so changing later
   logic never requires re-fetching from the wiki. `npm run scrape` chains
   all stages in order (0 → 1 → 2a → 2b → 2c → 3 → 4). All `api.php` traffic
   goes through one serialised queue in `lib/wiki.mjs` with a fixed gap +
   429/503 retry (a full boss run hit the wiki's rate limit); stage 1 saves
   its manifest per-boss and reclaims already-downloaded raw files, so an
   interrupted run resumes cheaply.
   - ~~Stage 0 — discover & stale-check~~ (`00-discover.mjs`, done). Diffs
     category members' wiki revision timestamps against
     `scripts/.data/manifest.json`, writes `to-fetch.json`.
   - ~~Stage 1 — fetch raw~~ (`01-fetch-raw.mjs`, done). Per-boss Bucket
     queries (`Infobox_monster` + `Dropsline`), writes
     `scripts/.data/raw/<slug>.json`, updates the manifest. Validated
     against Dagannoth Rex/Prime — Bucket's drop rows include the fully
     resolved Rare Drop Table contents per boss (flagged via
     `rareDropTable`), not just each page's literal drop lines.
   - Stage 2 builds the flat item list from three parts, run in order
     2a → 2b → 2c: 2a and 2b each fetch a supplementary source into its own
     cache file, then 2c reads the raw boss data plus those two caches and
     writes `items.json`.
   - ~~Stage 2a — collection-log source~~ (`02a-fetch-collection-log.mjs`,
     done). One Bucket query for the whole `Collection_log_source` table
     (~1,712 rows), variant `#anchor` rows collapsed, source links parsed
     to page names, cached to `scripts/.data/collection-log-source.json`.
     `sources` kept for later ranking.
   - ~~Stage 2b — recipe items~~ (`02b-fetch-recipes.mjs`, done).
     `Bucket:Recipe` per skill (`--only=`/`--limit=` like the boss
     scripts), dedupe by `output.name`, cache
     `{name, wikiLink, iconUrl (from output.image), skills: [{skill, level}]}`
     to `scripts/.data/recipe-items.json`. Rows with empty `output` skipped.
     Recipe files an item under its _last_ production step's skill (Amulet
     of fury lands under Magic 87, the enchant, not Crafting) — fine for
     flat-catalog coverage, a known gap for any future skill→item feature.
   - ~~Stage 2c — flatten & enrich items~~ (`02c-flatten-items.mjs`, done;
     an earlier per-boss "process/filter" draft, `02-process.mjs`, was
     scrapped with the notability-gate idea — see Notability above). Unions
     the boss drop names + the 2a/2b caches into one deduped list, tags
     each with its source(s) (`from: [...]`), derives a wiki link, and
     resolves icons: recipe items keep their own; everything else is looked
     up in the cached full `Infobox_item` map (`infobox-items.json`, 4
     paged requests, `--refresh` to re-pull). No per-item wiki calls.
     Missing caches are warned about and skipped. Output:
     `scripts/.data/items.json`.
     - **Fourth source added 2026-09-02: every page in `Infobox_item`
       itself**, not just icon-resolution for names the other three
       sources already found. Union of drop/collection-log/recipe alone
       gave 4,727 items and was missing real single-item pages that just
       aren't dropped, collection-logged, or recipe-crafted (Twinflame
       staff, a combination weapon; Blue moon armour set, which turned out
       to have its own infobox page after all) — see the closed-out
       "Known catalog gaps" entry below. Adding the full bucket (~12.4k
       page names, 6 with no declared image) brought the catalog to
       13,418 items. Re-running stage 3 after this surfaced 2 dead-link
       404s out of the ~8,700 new names (edge-case non-grind pages — a
       Construction interface variant and a quest scenery object) plus 61
       with no image URL at all in their infobox; left as `icon: null` per
       the recall-over-precision stance, not worth chasing.
   - ~~Stage 3 — cross-boss indexes~~ — dropped 2026-09-01 with the
     boss→item association (see Notability above). Nothing consumes a
     monster→drops index now that entry creation is search-only.
   - Stage 3 — download icons (`03-download-icons.mjs`, done). Pulls each
     entry's icon to `static/icons/<category>/<slug>.<ext>` (slug =
     kebab-cased name), 8-way concurrent, skips files already on disk
     (`--refresh` to force). Sources: `items.json` iconUrls, boss iconUrls
     from `raw/*.json`, and skills via the verified `<Skill>_icon.png`
     pattern. The upstream URLs are string-built from `File:` names, which
     404 on file-page redirects (charged-jewellery variants etc.), so
     stage 3 first resolves them all through the API's `imageinfo`
     (batched 50/call, follows redirects) before downloading. Writes
     `scripts/.data/icons.json` — a name→`/icons/...` map per category,
     plus `failed` and `noIcon` lists — for stage 4. `static/` is
     committed, so the downloaded files get checked in.
   - ~~Stage 4 — assemble the catalog~~ (`04-assemble-catalog.mjs`, done).
     Combines the static skill list, boss name/combat-level from
     `raw/*.json`, `items.json`, and the stage-3 icon manifest into
     `src/lib/data/catalog.json` — `{generatedAt, source, counts, skills,
bosses, items, minigames}`, each entry `{name, wikiLink, icon}` with
     icon a local path or null. `minigames` empty (source TBD). Committed.
2. **Pull real data** — not at full 341-boss scale yet; get the actual
   shape of the output (JSON catalog + downloaded/normalized icon files)
   proven out first, small scale, before committing to running it against
   everything.
3. ~~**Build the search endpoint**~~ (`src/routes/api/search/+server.ts`,
   done). `import catalog from '$lib/data/catalog.json'`, in-memory scan,
   ranks exact > prefix > word-start > substring. Params `q`, `type`
   (comma-separated), `limit`. `curl`-testable, no Firestore.
4. ~~**Rewire the frontend to the new backend**~~ (done 2026-09-01). The
   hand-typed `SKILLS`/`BOSSES`/`ITEMS` arrays, category menus, and
   level/quantity prompts are gone. Add/edit/delete all run through modals
   (`EntryModal.svelte`, `ConfirmModal.svelte`) — see the Entry bullet in
   Domain model for the creation/override flow. Native `confirm()` popups
   replaced too, for one consistent modal UX.
5. Further out, not yet scoped in detail: result ranking (marquee-item
   signal from collection-log / recipe membership), minigames (the
   remaining coverage gap below), actual Cloud Run deployment (see
   "Deployment status" above).

**Known catalog gaps (tabled 2026-09-01, item-coverage half closed
2026-09-02):**

- **Minigames** — `catalog.json`'s `minigames` array is empty; no source
  decided yet.
- ~~Real things missing from all three scrape sources~~ — closed by
  unioning the full `Infobox_item` table into stage 2c as a fourth source
  (see the stage 2c bullet above); both examples that motivated this
  ("Twinflame staff", "Blue moon armour set" — which turned out to have
  its own infobox page after all) are searchable now. What's left is
  narrower: a wiki concept with genuinely no single item page of its own
  (a true multi-item "set" grouping, if one actually exists — not
  confirmed, since the one example we had turned out to have a page) would
  still need manual entry: type a name (+ wiki link), no catalog match
  required, borrow an icon via the icon search. Not scoped further since
  no concrete example is known to still need it. A live wiki-search
  fallback when the local catalog returns nothing (raised when this was
  first discussed, before the fourth source closed most of the gap) would
  also help for anything genuinely uncatalogued.

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
              label: string,       // catalog name by default, user-overwritable
              icon: string,        // wiki-hotlinked image URL, "" if none
              done: boolean
              // wikiLink: string  // PLANNED, not yet a real field - see
                                    // Entry override design in Domain model
            }
          },
          entryOrder: [entryId, ...]   // explicit render order within the
                                        // node - object key order isn't
                                        // reliable for our random string IDs
                                        // (an ID that happens to look fully
                                        // numeric would sort first in JS)
        }
      },
      nodeOrder: [nodeId, ...],      // same reasoning as entryOrder above
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
  Render order within a map is tracked separately via an explicit `*Order`
  array (`flowOrder` at the board level, `entryOrder` per node) rather than
  relying on object key iteration order, which isn't reliable for our
  random string IDs.
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

**Planned addition: a real JSON API endpoint for catalog search** (not yet
built). Distinct in kind from the two SvelteKit backend files that exist
today — worth being precise about this, since all three look similar
(`.server.ts` files) but behave very differently:

- `+page.server.ts` (`actions.createBoard`) is a **form action** — its
  response is wrapped in SvelteKit's own action-response envelope (we've
  literally seen this wire format during testing:
  `{"type":"redirect","status":303,"location":"/b/..."}`), meant to be
  consumed by `use:enhance` on the client, not hit as a generic API.
- `+page.server.ts` (`load`) — its return value becomes the `data` prop for
  the matching `+page.svelte`, serialized via SvelteKit's own `devalue`
  serializer and embedded in SSR'd HTML or fetched through an internal
  SvelteKit-managed route on client navigation. Also not a generic API.
- A **`+server.ts`** file (no "page" in the name) is the one that behaves
  like an actual REST endpoint: exports plain functions per HTTP verb
  (`GET`, etc.), takes a request, must explicitly `return json({...})` (or
  any `Response`) — no envelope, no page attached, callable by anything
  (`curl`, `fetch`, a future mobile client) and gets back exactly the JSON
  written, nothing SvelteKit-specific wrapped around it.

The search endpoint (`src/routes/api/search/+server.ts` or similar) will be
this third kind — self-contained, zero `.svelte` involvement, fully
buildable/testable via `curl` alone before any frontend wiring happens. It
reads the catalog via a direct `import catalog from '$lib/data/catalog.json'`
(Vite bundles JSON imports at build time) rather than Firestore — the
catalog is shared static reference data, not per-user editable board
content, so it doesn't belong in the database. The whole parsed catalog
lives in the Node process's memory for the life of that container instance
(cheap at current scale, tens of MB at worst; would need
rethinking — a real search index, not a bigger JSON blob — if this ever
grows toward "all 12k+ items"). Cost of this design: refreshing the catalog
requires a rebuild + redeploy, since it's baked in at build time, not read
live — an accepted tradeoff for zero runtime wiki dependency and no
per-request I/O cost.

**Deployment status: not yet deployed anywhere.** Everything so far has run
via `npm run dev` + the Firestore emulator only. The Cloud Run hosting
choice (see Stack below) has never actually been exercised — no Dockerfile
written, no image built, no `gcloud run deploy` run. Needed before a real
deploy: a `Dockerfile` wrapping the `adapter-node` build output, a build +
push step (Cloud Build or local Docker + Artifact Registry), the actual
`gcloud run deploy`, `PUBLIC_FIREBASE_*` env vars set on the Cloud Run
service, and verifying the default Cloud Run service account actually has
Firestore permissions (or granting them). Manual one-off deploy vs. an
automated CI/CD trigger on push to `main` is also still an open question.

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
  require top-level shape validation, `delete` open to anyone with the
  board's exact ID (same as edit access — there's no auth to gate it
  further on, and deletion has a confirm prompt client-side).
  - Redeployed 2026-09-03 (`firebase deploy --only firestore:rules
    --project osrs-grind`) as part of prepping for the Cloud Run
    deployment (see Roadmap — deployment below) — prod now matches the
    repo's `name` field and `delete` rules. Keep it that way: only the
    emulator picks up `firestore.rules` automatically, so any future rules
    change needs the same manual redeploy.
- End-to-end plumbing wired and verified: `/` has a `createBoard` form
  action (Admin SDK, generates a `nanoid` board ID, redirects to
  `/b/[boardId]`); `/b/[boardId]` SSRs the board via Admin SDK (404s if
  missing) then hands off to the Firebase Web SDK client-side for realtime
  `onSnapshot` sync, with a test "add flow" button proving writes go through
  the deployed security rules. No graph UI yet — this only proves the data
  layer works.

## Roadmap — deployment (current, active)

Decided 2026-09-03, superseding the open questions in "Deployment status"
and "Stack" above where they conflict. Architecture: **one Cloud Run
service** runs the whole SvelteKit app (`adapter-node`) — SSR, the
`createBoard` action, and `/api/search` all in the same Node process,
same as `npm run dev` today. Two things deliberately live outside that
service:

- **Icons served directly from a public-read GCS bucket**, never baked
  into the container image and never routed through the app. Rejected
  alternatives: baking icons into the image via a Docker build step
  (works, but every build either re-downloads ~4,800 files from the wiki
  or depends on Docker/Cloud Build layer caching actually being
  configured and persisted between builds — not automatic on Cloud
  Build's default fresh-worker-per-build model); fetching from GCS into
  the container at startup (shrinks the image but taxes every cold
  start — Cloud Run scales to zero at this app's traffic level, so cold
  starts are frequent). Serving straight from GCS avoids both: the image
  never contains icons at all, so it's small on every build, and the
  browser gets icon bytes independent of the app server entirely. Cost:
  a catalog-changing deploy becomes two ordered steps instead of one —
  sync icons to GCS *first*, then deploy the app (deploying the new
  `catalog.json` first would reference icon URLs that don't exist in the
  bucket yet). A pure code change never touches GCS at all.
- **Full static-site hosting (GitHub Pages, `adapter-static`) was
  considered and rejected** — see the deployment brainstorm in chat
  history around 2026-09-03. It would've required moving `createBoard`
  and the board-page load to be fully client-side (losing the SSR fast
  first paint DESIGN.md already calls out as important for mobile), plus
  running search as a second, separately-hosted service or shipping the
  entire catalog (2.5MB raw / ~270KB gzipped and growing) to every
  client. Decided against on both counts. GitHub is still used for
  source hosting and CI (below), just not as the thing serving the app.

**Punch list, in dependency order:**

1. ~~Redeploy Firestore security rules to production~~ — done 2026-09-03,
   see the TODO note under "Infrastructure already provisioned" above.
2. ~~Create a public-read GCS bucket~~ (`osrs-grind-icons`, `us-central1`,
   uniform bucket-level access) in the `osrs-grind` project; current
   `static/icons/` contents uploaded. Verified with a live `curl` (200).
3. ~~Update the scraper (stages 3-4) to write full GCS URLs~~ into
   `catalog.json`'s `icon` field instead of local `/icons/...` paths —
   `GCS_ICON_BASE_URL` in stage 4, a plain prefix swap over stage 3's
   existing manifest. `static/icons/` is now local staging only, published
   with `gcloud storage rsync -r static/icons gs://osrs-grind-icons/icons`
   (a separate, manual step — never part of an app deploy, since icons
   aren't in git and change on a completely different cadence than code).
4. ~~Write the Dockerfile~~ (`adapter-node` multi-stage build; `.dockerignore`
   excludes `static/icons/`, `scripts/.data/`, `.env*` etc. from the build
   context). Two things only found by actually building it:
   - `PUBLIC_FIREBASE_*` (`$env/static/public`) get baked into the JS
     bundle at **build time**, not read at container runtime - so the
     Dockerfile's builder stage runs `cp .env.example .env` before `npm
     run build` (reusing the real, non-secret values already committed
     there) rather than needing them wired up as deploy-time config at
     all. This replaces the original plan of setting them as Cloud Run env
     vars - there's nothing to set for these.
   - The Admin SDK's `applicationDefault()` credentials only resolve
     automatically inside a real GCP environment (Cloud Run's attached
     service account, via its metadata server) - a bare local container
     has no credentials at all, and hitting Firestore without them threw
     an uncaught rejection that **crashed the whole container process**,
     not just the one request (verified locally, both the crash without
     credentials and, mounting a local `gcloud auth
     application-default-login` credential file in, a full working
     create-board-to-Firestore flow). The crash-the-whole-process behavior
     is a real robustness gap worth hardening later (a misconfigured
     service account in prod would take down every request, not fail one
     gracefully) - not blocking this list, just noted so it isn't lost.
   - `ORIGIN` needs to be set for SvelteKit's CSRF check on the
     `createBoard` form action to accept requests - not known until step 6
     assigns the Cloud Run URL, so it's a step-7 runtime env var, not
     something the image itself can carry.
5. Set the `ORIGIN` env var on the Cloud Run service once its URL is known
   (see the Dockerfile bullet above for why - `PUBLIC_FIREBASE_*` needs no
   Cloud Run config at all, it's already baked into the image).
6. ~~Verify the Cloud Run service's attached service account has Firestore
   permissions~~ — no default compute service account exists yet (this
   project's never used Compute Engine or Cloud Run), so the plan changed
   to deploying with an explicit `--service-account` instead of relying on
   that default: `firebase-adminsdk-fbsvc@osrs-grind.iam.gserviceaccount.com`,
   which Firebase already created for Admin SDK access. Granted it
   `roles/datastore.user` explicitly (on top of its existing
   `roles/firebase.sdkAdminServiceAgent`, which likely already covered
   this - added anyway to remove doubt, IAM roles stack additively).
7. ~~Create an Artifact Registry repository~~ — `grind-app`, Docker format,
   `us-central1`, in the `osrs-grind` project (the Artifact Registry API
   needed enabling first, one-time per-project). This is where the built
   image lives; GitHub never stores or serves it — git only ever holds the
   `Dockerfile` recipe, not the built image.
8. First deploy by hand (build, push to that Artifact Registry repo,
   `gcloud run deploy`) to prove the whole thing end-to-end before
   automating.
9. Set up Workload Identity Federation between the GitHub repo and the
   GCP project — GitHub Actions authenticates via short-lived OIDC
   tokens, no stored service-account key.
10. Write the GitHub Actions workflow: `on: push: branches: [main]` →
    build (on the runner, or via a triggered Cloud Build job) → push to
    Artifact Registry → `gcloud run deploy`. (A merged PR is a push to
    `main`, so this covers both without a separate trigger.)
11. Test the workflow with a trivial push.

**Deferred, not blocking any of the above:** making the repo public (a
git-history sanity check for anything sensitive is worth doing right
before that specific step, not before the rest of this list), and branch
protection / collaborator merge-access rules on `main` (only needed
before actually inviting others to contribute — WIF itself is safe under
a public repo already, since it only trusts `push`-triggered workflow
runs, not fork-originated `pull_request` runs, so a public repo alone
doesn't grant deploy access to anyone who can't already merge to `main`).
