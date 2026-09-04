// Stage 1: fetch raw data.
//
// Reads scripts/.data/to-fetch.json (written by stage 0), and for each
// monster page listed there, queries the wiki's Bucket API for its own
// infobox data (name, icon, combat level) and its full drop table
// (Dropsline), writing one raw JSON file per page to
// scripts/.data/raw/<slug>.json (slug comes from stage 0, already
// disambiguated there if two titles would otherwise collide - see its
// comment on that), tagged with the source categor(y/ies) it matched
// (`source: ["boss"]`, `["slayer"]`, or both - see
// lib/monster-categories.mjs). Updates the manifest with each
// successfully-fetched page's revision timestamp so future stage-0 runs
// can correctly skip it until it changes.
//
// A title with no infobox row anywhere (see the fallback chain below) is
// skipped outright rather than written as a stub - Category:Bosses turned
// out to have this problem after all (see below), and Category:Slayer
// monsters includes at least one non-monster page ("Slayer monsters", the
// category's own overview article). If a raw file already exists on disk
// for a title that now resolves this way (e.g. from an earlier run under
// older logic), it's deleted rather than left behind - stage 4 reads every
// file physically in RAW_DIR, not just what the manifest currently tracks,
// so an unremoved stale file would keep getting served forever.
//
// Not every boss page uses {{Infobox monster}} (added 2026-09-04, chasing
// down why Tempoross/Wintertodt/etc. had no icon despite being real,
// current bosses). Skilling/area bosses get modeled with a different
// infobox template depending on how the wiki treats them mechanically:
// Tempoross as an NPC, Wintertodt as a piece of interactive scenery (the
// snow-storm vortex, not a creature at all), and multi-phase/grouped
// fights (Grotesque Guardians, Royal Titans, Moons of Peril) as an
// "Activity" like a minigame. fetchMonsterInfo() falls back through
// infobox_npc -> infobox_activity -> infobox_scenery, in that order, when
// infobox_monster has nothing. A page with no row in *any* of the four
// gets the treatment above (skipped, stale raw file removed) - this is
// what correctly drops pure overview/meta articles that happen to sit in
// Category:Bosses ("Boss", "Boss kill count", "Barrows brothers") and a
// never-released concept boss ("Wrathmaw", killed by a failed poll) that
// have no infobox of any kind. A few umbrella pages for bosses whose
// individual fights are already separately catalogued (e.g. "Dagannoth
// Kings" alongside Dagannoth Rex/Prime/Supreme, "Barrows" alongside the
// six brothers) do have an infobox_activity row and end up catalogued too
// - a little redundant, but the catalog doesn't gate on this kind of
// judgment call anywhere else either (see "Notability" in DESIGN.md), so
// this doesn't special-case them out either.
//
// This is the only stage that talks to the wiki for actual content (stage
// 0 only checks timestamps) - deliberately does no filtering/normalization
// beyond parsing drop_json, so stage 2 can be re-run against this output
// with different filtering logic without ever re-fetching from the wiki.
//
// Usage:
//   node scripts/01-fetch-raw.mjs
//   node scripts/01-fetch-raw.mjs --refresh   # ignore the on-disk reclaim
//                                              # shortcut below, always
//                                              # re-fetch from the wiki -
//                                              # for when the scraper's own
//                                              # logic changed, not the wiki
//                                              # page (pair with stage 0's
//                                              # own --refresh, which is
//                                              # what actually gets a title
//                                              # back into to-fetch.json in
//                                              # the first place)

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { apiGet, bucketQuery, bucketStringLiteral, fileRefToImageUrl } from './lib/wiki.mjs';

function parseArgs(argv) {
	return { refresh: argv.includes('--refresh') };
}

const DATA_DIR = path.join(process.cwd(), 'scripts', '.data');
const TO_FETCH_PATH = path.join(DATA_DIR, 'to-fetch.json');
const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.json');
const RAW_DIR = path.join(DATA_DIR, 'raw');

function loadManifest() {
	if (!existsSync(MANIFEST_PATH)) return { updatedAt: null, monsters: {} };
	const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
	// One-time migration: pre-monsters manifests keyed everything under
	// `bosses` (all of it genuinely was Category:Bosses at the time).
	if (!manifest.monsters) manifest.monsters = manifest.bosses ?? {};
	return manifest;
}

// Tried in order when infobox_monster has no row for a page. None of these
// carry a combat_level field - they're not modeled as "monster" pages at
// all, wiki-side, so a null combatLevel for a page resolved this way is
// correct, not a gap (verified: these are exactly the skilling-boss /
// grouped-fight / area-overview cases where "combat level" isn't a
// meaningful single number anyway).
const FALLBACK_INFOBOX_BUCKETS = ['infobox_npc', 'infobox_activity', 'infobox_scenery'];

async function fetchWikitext(title) {
	const data = await apiGet({ action: 'parse', page: title, prop: 'wikitext', format: 'json' });
	return data.parse?.wikitext?.['*'] ?? '';
}

// Multi-version infoboxes (e.g. Tempoross's Surfaced/Submerged/Enraged, or
// Grotesque Guardians' Dawn/Dusk) return one Bucket row per version, in an
// order that doesn't reliably match the page's own declared version order
// (verified for Tempoross - Bucket returned Enraged/Surfaced/Submerged,
// not the page's declared Surfaced/Submerged/Enraged). So picking "the"
// image for a single-icon catalog means reading the page's own wikitext
// for the first declared version's `image1` parameter, a convention shared
// across all of these infobox templates - not trusting Bucket's row order.
async function resolvePrimaryImage(title, rows) {
	if (rows.length === 1) return rows[0].image?.[0] ?? null;
	const wikitext = await fetchWikitext(title);
	const m = wikitext.match(/\|\s*image1\s*=\s*\[\[File:([^\]|]+)/);
	if (m) return `File:${m[1].trim()}`;
	return rows[0].image?.[0] ?? null; // no image1 found - better than nothing
}

// Tries each fallback bucket in turn; returns the first one with at least
// one row for this page, or null if none of them have it at all either.
async function fetchFallbackInfoboxRows(title) {
	for (const bucket of FALLBACK_INFOBOX_BUCKETS) {
		const rows = await bucketQuery(
			`bucket("${bucket}").select("page_name","image").where("page_name",${bucketStringLiteral(title)}).run()`
		);
		if (rows.length > 0) return rows;
	}
	return null;
}

// Returns null if the page has no infobox row anywhere in the fallback
// chain (not a real monster/boss page at all).
async function fetchMonsterInfo(title) {
	const rows = await bucketQuery(
		`bucket("infobox_monster").select("name","image","combat_level").where("page_name",${bucketStringLiteral(title)}).run()`
	);
	const row = rows[0];
	if (row) {
		const fileRef = row.image?.[0] ?? null;
		return {
			name: row.name ?? title,
			iconUrl: fileRef ? fileRefToImageUrl(fileRef) : null,
			combatLevel: row.combat_level ?? null
		};
	}

	const fallbackRows = await fetchFallbackInfoboxRows(title);
	if (!fallbackRows) return null;
	const fileRef = await resolvePrimaryImage(title, fallbackRows);
	return {
		name: title,
		iconUrl: fileRef ? fileRefToImageUrl(fileRef) : null,
		combatLevel: null
	};
}

async function fetchDrops(title) {
	const rows = await bucketQuery(
		`bucket("dropsline").select("item_name","drop_json","rare_drop_table").where("page_name",${bucketStringLiteral(title)}).limit(500).run()`
	);
	return rows.map((row) => {
		const dj = JSON.parse(row.drop_json);
		return {
			name: row.item_name,
			rarity: dj.Rarity ?? null,
			quantity: dj['Drop Quantity'] ?? null,
			dropValue: dj['Drop Value'] ?? null,
			dropType: dj['Drop type'] ?? null,
			rareDropTable: 'rare_drop_table' in row
		};
	});
}

async function main() {
	const { refresh } = parseArgs(process.argv.slice(2));
	if (!existsSync(TO_FETCH_PATH)) {
		console.error(`${TO_FETCH_PATH} not found - run stage 0 first.`);
		process.exit(1);
	}
	const toFetch = JSON.parse(readFileSync(TO_FETCH_PATH, 'utf8'));
	if (toFetch.monsters.length === 0) {
		console.log('Nothing to fetch - everything is already current.');
		return;
	}

	mkdirSync(RAW_DIR, { recursive: true });
	const manifest = loadManifest();

	const saveManifest = () => {
		manifest.updatedAt = new Date().toISOString();
		writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
	};

	let fetched = 0;
	let skipped = 0;
	let notAMonster = 0;
	for (const { title, wikiRevisionTimestamp, sources, slug } of toFetch.monsters) {
		const rawFile = path.join('scripts', '.data', 'raw', `${slug}.json`);
		const rawPath = path.join(RAW_DIR, `${slug}.json`);

		// Reclaim a page already on disk at this revision - lets a run that
		// died partway (e.g. a rate-limit) resume without re-fetching it, even
		// though the crash meant its manifest entry was lost. Also checks
		// title, not just revision timestamp, in case a slug is ever reused
		// by a different page between runs (see the collision handling in
		// stage 0) - otherwise this could reclaim the wrong page's file.
		if (!refresh && existsSync(rawPath)) {
			try {
				const prev = JSON.parse(readFileSync(rawPath, 'utf8'));
				if (prev.title === title && prev.wikiRevisionTimestamp === wikiRevisionTimestamp) {
					manifest.monsters[title] = { wikiRevisionTimestamp, rawFile };
					saveManifest();
					skipped++;
					continue;
				}
			} catch {
				// unreadable/partial file - fall through and re-fetch
			}
		}

		console.log(`Fetching "${title}" (${sources.join(', ')})...`);
		const [monster, drops] = await Promise.all([fetchMonsterInfo(title), fetchDrops(title)]);
		if (!monster) {
			console.warn(`  no infobox row anywhere in the fallback chain - not a real page, skipping`);
			notAMonster++;
			// A raw file can already be on disk here from an earlier run that
			// wrote one for this title under older logic (this is exactly what
			// happened to "Boss"/"Wrathmaw"/etc. - written before the "skip if
			// no infobox anywhere" rule existed, then never revisited because
			// their wiki revision hadn't changed). Stage 4 reads every file
			// physically in RAW_DIR, not just what the manifest knows about, so
			// leaving it there would keep serving a page we now know isn't real.
			if (existsSync(rawPath)) {
				unlinkSync(rawPath);
				console.warn(`  removed stale raw file for "${title}"`);
			}
			delete manifest.monsters[title];
			saveManifest();
			continue;
		}
		const raw = {
			fetchedAt: new Date().toISOString(),
			wikiRevisionTimestamp,
			title,
			source: sources,
			...monster,
			drops
		};
		writeFileSync(rawPath, JSON.stringify(raw, null, 2));
		console.log(`  -> ${drops.length} drop(s), icon: ${monster.iconUrl ? 'found' : 'MISSING'}`);

		manifest.monsters[title] = { wikiRevisionTimestamp, rawFile };
		saveManifest();
		fetched++;
	}

	console.log(
		`\nFetched ${fetched} page(s), ${skipped} already on disk, ${notAMonster} not a real monster page. Manifest updated.`
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
