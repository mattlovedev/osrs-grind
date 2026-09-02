// Stage 2c: flatten & enrich items (runs after 2a + 2b).
//
// Merges four item sources into one flat, deduped list:
//   - boss drop names from stage 1's raw files (scripts/.data/raw/*.json)
//   - collection-log item names from stage 2a
//     (scripts/.data/collection-log-source.json)
//   - recipe output items from stage 2b (scripts/.data/recipe-items.json)
//   - every page in the full Bucket:Infobox_item table itself (~12.4k
//     rows) - the broadest source, added 2026-09-02 so items with no
//     drop/collection-log/recipe presence (e.g. Twinflame staff, Blue moon
//     armour set - real item pages that just aren't dropped, logged, or
//     crafted) still make the catalog. Recall over precision (see
//     DESIGN.md "Notability").
//
// Each unique item gets a wiki link (derived from its name) and an icon.
// Recipe items already carry an icon (the recipe's output.image); every
// other name is resolved against the Infobox_item table, which pages out
// in 4 requests (limit 5000 + offset) and is cached to
// scripts/.data/infobox-items.json, so re-runs do zero wiki traffic - pass
// --refresh to re-pull it. Items with no icon anywhere are kept with
// iconUrl: null - recall beats precision for a search catalog. Writes
// scripts/.data/items.json.
//
// Discards rarity / quantity / drop-value and the which-boss-dropped-it
// association (see DESIGN.md "Boss->item association dropped"). The 2a/2b
// caches are optional: a missing cache file is warned about and skipped, so
// this still runs on whatever sources are present.
//
// Usage:
//   node scripts/02c-flatten-items.mjs
//   node scripts/02c-flatten-items.mjs --refresh      # re-pull the infobox map
//   node scripts/02c-flatten-items.mjs --limit=20     # first 20 items (dev)

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { bucketQuery, fileRefToImageUrl, wikiPageUrl } from './lib/wiki.mjs';

const DATA_DIR = path.join(process.cwd(), 'scripts', '.data');
const RAW_DIR = path.join(DATA_DIR, 'raw');
const COLLECTION_LOG_PATH = path.join(DATA_DIR, 'collection-log-source.json');
const RECIPE_ITEMS_PATH = path.join(DATA_DIR, 'recipe-items.json');
const INFOBOX_CACHE_PATH = path.join(DATA_DIR, 'infobox-items.json');
const ITEMS_PATH = path.join(DATA_DIR, 'items.json');

const PAGE_SIZE = 5000; // Bucket's hard per-query row cap.

function parseArgs(argv) {
	const limitArg = argv.find((a) => a.startsWith('--limit='));
	return {
		refresh: argv.includes('--refresh'),
		limit: limitArg ? Number(limitArg.slice('--limit='.length)) : null
	};
}

function readJson(p) {
	return JSON.parse(readFileSync(p, 'utf8'));
}

// Page the entire Infobox_item table into a { page_name: iconUrl|null } map.
async function fetchInfoboxIconMap() {
	const icons = {};
	for (let offset = 0; ; offset += PAGE_SIZE) {
		const rows = await bucketQuery(
			`bucket("infobox_item").select("page_name","image").limit(${PAGE_SIZE}).offset(${offset}).run()`
		);
		for (const row of rows) {
			if (row.page_name in icons) continue;
			const fileRef = row.image?.[0] ?? null;
			icons[row.page_name] = fileRef ? fileRefToImageUrl(fileRef) : null;
		}
		console.log(`  infobox_item: ${offset + rows.length} rows`);
		if (rows.length < PAGE_SIZE) break;
	}
	return icons;
}

async function loadIconMap(refresh) {
	if (!refresh && existsSync(INFOBOX_CACHE_PATH)) {
		const cached = readJson(INFOBOX_CACHE_PATH);
		console.log(
			`Infobox icon map: ${cached.count} entries from cache (generated ${cached.generatedAt}).`
		);
		return cached.icons;
	}
	console.log('Fetching the Infobox_item table...');
	const icons = await fetchInfoboxIconMap();
	const count = Object.keys(icons).length;
	mkdirSync(DATA_DIR, { recursive: true });
	writeFileSync(
		INFOBOX_CACHE_PATH,
		JSON.stringify({ generatedAt: new Date().toISOString(), count, icons }, null, 2)
	);
	console.log(`Infobox icon map: ${count} entries -> ${INFOBOX_CACHE_PATH}`);
	return icons;
}

async function main() {
	const { refresh, limit } = parseArgs(process.argv.slice(2));

	if (!existsSync(RAW_DIR)) {
		console.error(`${RAW_DIR} not found - run stage 1 first.`);
		process.exit(1);
	}
	const rawFiles = readdirSync(RAW_DIR).filter((f) => f.endsWith('.json'));
	if (rawFiles.length === 0) {
		console.error(`No raw files in ${RAW_DIR} - run stage 1 first.`);
		process.exit(1);
	}

	// name -> { name, iconUrl (null until known), from: Set<source> }
	const byName = new Map();
	const add = (name, source, iconUrl) => {
		if (!name) return;
		let entry = byName.get(name);
		if (!entry) {
			entry = { name, iconUrl: null, from: new Set() };
			byName.set(name, entry);
		}
		entry.from.add(source);
		if (!entry.iconUrl && iconUrl) entry.iconUrl = iconUrl;
	};

	// Source 1: boss drops.
	for (const file of rawFiles) {
		const raw = readJson(path.join(RAW_DIR, file));
		for (const drop of raw.drops ?? []) add(drop.name, 'drop');
	}
	const dropCount = byName.size;

	// Source 2: collection log (stage 2a).
	if (existsSync(COLLECTION_LOG_PATH)) {
		for (const it of readJson(COLLECTION_LOG_PATH).items ?? []) add(it.name, 'collection-log');
	} else {
		console.warn(`  ${COLLECTION_LOG_PATH} missing - skipping collection-log source (run 2a).`);
	}

	// Source 3: recipes (stage 2b) - these bring their own icon.
	if (existsSync(RECIPE_ITEMS_PATH)) {
		for (const it of readJson(RECIPE_ITEMS_PATH).items ?? []) add(it.name, 'recipe', it.iconUrl);
	} else {
		console.warn(`  ${RECIPE_ITEMS_PATH} missing - skipping recipe source (run 2b).`);
	}
	const beforeInfobox = byName.size;

	// Source 4: every page in Infobox_item itself - the broadest source,
	// catches item pages the other three sources never mention at all.
	const iconMap = await loadIconMap(refresh);
	for (const [name, iconUrl] of Object.entries(iconMap)) add(name, 'infobox-item', iconUrl);

	let entries = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
	console.log(
		`${entries.length} unique item(s): ${dropCount} from ${rawFiles.length} boss file(s), ` +
			`+${beforeInfobox - dropCount} added by 2a/2b, +${entries.length - beforeInfobox} added by infobox-item.`
	);
	if (limit) {
		entries = entries.slice(0, limit);
		console.log(`Limited to first ${limit}.`);
	}

	const items = entries.map((e) => ({
		name: e.name,
		wikiLink: wikiPageUrl(e.name),
		iconUrl: e.iconUrl,
		from: [...e.from].sort()
	}));

	mkdirSync(DATA_DIR, { recursive: true });
	writeFileSync(
		ITEMS_PATH,
		JSON.stringify({ generatedAt: new Date().toISOString(), count: items.length, items }, null, 2)
	);

	const missingIcon = items.filter((i) => !i.iconUrl);
	console.log(`\nWrote ${items.length} item(s) -> ${ITEMS_PATH}`);
	if (missingIcon.length) {
		console.log(`  ${missingIcon.length} with no icon (iconUrl: null):`);
		console.log(`  ${missingIcon.map((i) => i.name).join(', ')}`);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
