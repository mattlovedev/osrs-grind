// Stage 2: flatten & enrich items.
//
// Reads every raw per-boss file from stage 1 (scripts/.data/raw/<slug>.json),
// collects every drop name across all of them, dedupes to a flat item list,
// and enriches each unique item with a wiki link (derived from the name)
// and its declared icon - the filename the item's own page puts in its
// infobox `image` field, via Bucket:Infobox_item (per DESIGN.md, this is
// more reliable than guessing a filename pattern). Writes
// scripts/.data/items.json.
//
// Deliberately discards rarity / quantity / drop-value and the
// which-boss-dropped-it association: the catalog is a flat searchable list,
// not a drop database (see DESIGN.md "Boss->item association dropped").
// Items with no infobox_item match are kept anyway with iconUrl: null -
// recall beats precision for a search catalog.
//
// The only wiki traffic here is the per-item infobox lookup; the drop data
// itself comes entirely from stage 1's output, so re-running this with
// different item-list logic never re-fetches drop tables.
//
// Usage:
//   node scripts/02-flatten-items.mjs
//   node scripts/02-flatten-items.mjs --limit=20    # first 20 unique items (dev)

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { bucketQuery, bucketStringLiteral, fileRefToImageUrl, wikiPageUrl } from './lib/wiki.mjs';

const DATA_DIR = path.join(process.cwd(), 'scripts', '.data');
const RAW_DIR = path.join(DATA_DIR, 'raw');
const ITEMS_PATH = path.join(DATA_DIR, 'items.json');

function parseArgs(argv) {
	const limitArg = argv.find((a) => a.startsWith('--limit='));
	return { limit: limitArg ? Number(limitArg.slice('--limit='.length)) : null };
}

/** Look up an item page's declared icon file, or null if it has none. */
async function fetchItemIcon(name) {
	const rows = await bucketQuery(
		`bucket("infobox_item").select("image").where("page_name",${bucketStringLiteral(name)}).run()`
	);
	const fileRef = rows[0]?.image?.[0] ?? null;
	return fileRef ? fileRefToImageUrl(fileRef) : null;
}

async function main() {
	const { limit } = parseArgs(process.argv.slice(2));

	if (!existsSync(RAW_DIR)) {
		console.error(`${RAW_DIR} not found - run stage 1 first.`);
		process.exit(1);
	}
	const rawFiles = readdirSync(RAW_DIR).filter((f) => f.endsWith('.json'));
	if (rawFiles.length === 0) {
		console.error(`No raw files in ${RAW_DIR} - run stage 1 first.`);
		process.exit(1);
	}

	// Collect every distinct drop name across every boss. The first boss a
	// name was seen in is remembered only for a readable log line.
	const names = new Map();
	for (const file of rawFiles) {
		const raw = JSON.parse(readFileSync(path.join(RAW_DIR, file), 'utf8'));
		for (const drop of raw.drops ?? []) {
			if (!names.has(drop.name)) names.set(drop.name, raw.title);
		}
	}

	let uniqueNames = [...names.keys()].sort();
	console.log(`${uniqueNames.length} unique item name(s) across ${rawFiles.length} boss file(s).`);
	if (limit) {
		uniqueNames = uniqueNames.slice(0, limit);
		console.log(`Limited to first ${limit}.`);
	}

	// One infobox query per item, sequential. Fine at validation scale
	// (~80 items); batch or pool this for the full 341-boss run.
	const items = [];
	const missingIcon = [];
	for (let i = 0; i < uniqueNames.length; i++) {
		const name = uniqueNames[i];
		const iconUrl = await fetchItemIcon(name);
		if (!iconUrl) missingIcon.push(name);
		items.push({ name, wikiLink: wikiPageUrl(name), iconUrl });
		if ((i + 1) % 25 === 0 || i + 1 === uniqueNames.length) {
			console.log(`  ${i + 1}/${uniqueNames.length}`);
		}
	}

	mkdirSync(DATA_DIR, { recursive: true });
	writeFileSync(
		ITEMS_PATH,
		JSON.stringify({ generatedAt: new Date().toISOString(), count: items.length, items }, null, 2)
	);

	console.log(`\nWrote ${items.length} item(s) -> ${ITEMS_PATH}`);
	if (missingIcon.length) {
		console.log(
			`\n${missingIcon.length} item(s) with no infobox_item icon (kept anyway, iconUrl: null):`
		);
		console.log(`  ${missingIcon.join(', ')}`);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
