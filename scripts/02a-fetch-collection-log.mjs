// Stage 2a: fetch the collection-log source table.
//
// One Bucket query pulls the entire Bucket:Collection_log_source table
// (~1,712 rows, no pagination). Each row is an item that appears in some
// in-game collection log, plus the wiki pages listed as its sources.
//
// This is purely a cache-to-disk fetch: it writes
// scripts/.data/collection-log-source.json for stage 2
// (02c-flatten-items.mjs) to union into the item list. Every item_name here
// belongs in the catalog - being collection-logged IS the notability
// signal, so there's nothing to filter (see DESIGN.md "Notability: include
// broadly, don't gate"). The `sources` are kept for later result ranking,
// not used by the flat catalog itself.
//
// Run this before 02c-flatten-items.mjs. Re-run any time for a fresh pull;
// it's a single request.
//
// Usage:
//   node scripts/02a-fetch-collection-log.mjs
//   node scripts/02a-fetch-collection-log.mjs --limit=20   # dev preview

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { bucketQuery } from './lib/wiki.mjs';

const DATA_DIR = path.join(process.cwd(), 'scripts', '.data');
const OUT_PATH = path.join(DATA_DIR, 'collection-log-source.json');

// The table is ~1,712 rows; this is comfortably above it. We warn if a run
// ever hits the limit so silent truncation is visible.
const ROW_LIMIT = 5000;

function parseArgs(argv) {
	const limitArg = argv.find((a) => a.startsWith('--limit='));
	return { limit: limitArg ? Number(limitArg.slice('--limit='.length)) : null };
}

// "Dragon spear#(unp)" -> "Dragon spear". The #anchor targets an item
// variant section; the catalog keys on the base item page.
function stripAnchor(name) {
	const hash = name.indexOf('#');
	return hash === -1 ? name : name.slice(0, hash);
}

// "[[Dagannoth Rex]]" / "[[The Mimic#Master|The Mimic (Master)]]" -> the
// link target ("Dagannoth Rex", "The Mimic").
function sourceLinkTarget(link) {
	const m = link.match(/^\[\[([^|\]]+)(?:\|[^\]]*)?\]\]$/);
	return (m ? stripAnchor(m[1]) : link).trim();
}

async function main() {
	const { limit } = parseArgs(process.argv.slice(2));

	console.log('Fetching Bucket:Collection_log_source...');
	const rows = await bucketQuery(
		`bucket("collection_log_source").select("item_name","sources").limit(${ROW_LIMIT}).run()`
	);
	if (rows.length >= ROW_LIMIT) {
		console.warn(
			`  got ${rows.length} rows = the ${ROW_LIMIT} cap; result may be truncated - raise ROW_LIMIT.`
		);
	}
	console.log(`  ${rows.length} rows.`);

	// Collapse variant rows onto their base item, merging source lists.
	const byItem = new Map();
	for (const row of rows) {
		const name = stripAnchor(row.item_name ?? '').trim();
		if (!name) continue;
		const sources = (row.sources ?? []).map(sourceLinkTarget).filter(Boolean);
		if (!byItem.has(name)) byItem.set(name, new Set());
		for (const s of sources) byItem.get(name).add(s);
	}

	let items = [...byItem.entries()]
		.map(([name, sources]) => ({ name, sources: [...sources].sort() }))
		.sort((a, b) => a.name.localeCompare(b.name));

	if (limit) {
		items = items.slice(0, limit);
		console.log(`Limited to first ${limit}.`);
	}

	mkdirSync(DATA_DIR, { recursive: true });
	writeFileSync(
		OUT_PATH,
		JSON.stringify({ generatedAt: new Date().toISOString(), count: items.length, items }, null, 2)
	);
	console.log(`\nWrote ${items.length} unique collection-log item(s) -> ${OUT_PATH}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
