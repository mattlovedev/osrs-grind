// Stage 0: discover & stale-check.
//
// Enumerates a wiki category (bosses by default), checks each page's last
// content-revision timestamp against what we already know from a previous
// run (scripts/.data/manifest.json), and writes the list of pages that are
// new or changed to scripts/.data/to-fetch.json for stage 1 to process.
//
// This stage never fetches drop data itself - only cheap, batched
// timestamp checks - so it's safe/fast to run at full scope every time,
// even while later stages are still being scoped down for testing.
//
// Usage:
//   node scripts/00-discover.mjs                                  # all bosses
//   node scripts/00-discover.mjs --limit=5                        # first 5
//   node scripts/00-discover.mjs --only="Dagannoth Rex,Dagannoth Prime"

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fetchAllCategoryMembers, fetchRevisionTimestamps } from './lib/wiki.mjs';

const DATA_DIR = path.join(process.cwd(), 'scripts', '.data');
const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.json');
const TO_FETCH_PATH = path.join(DATA_DIR, 'to-fetch.json');

function parseArgs(argv) {
	const onlyArg = argv.find((a) => a.startsWith('--only='));
	const limitArg = argv.find((a) => a.startsWith('--limit='));
	return {
		only: onlyArg
			? onlyArg
					.slice('--only='.length)
					.split(',')
					.map((s) => s.trim())
			: null,
		limit: limitArg ? Number(limitArg.slice('--limit='.length)) : null
	};
}

function loadManifest() {
	if (!existsSync(MANIFEST_PATH)) return { updatedAt: null, bosses: {} };
	return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

async function main() {
	const { only, limit } = parseArgs(process.argv.slice(2));

	console.log('Fetching Category:Bosses...');
	let titles = await fetchAllCategoryMembers('Category:Bosses');
	console.log(`Found ${titles.length} boss pages.`);

	if (only) {
		titles = titles.filter((t) => only.includes(t));
		console.log(`Filtered to --only list: ${titles.join(', ')}`);
	}
	if (limit) {
		titles = titles.slice(0, limit);
		console.log(`Limited to first ${limit}.`);
	}

	console.log(`Checking staleness for ${titles.length} boss page(s)...`);
	const currentTimestamps = await fetchRevisionTimestamps(titles);

	const manifest = loadManifest();
	const toFetch = [];
	let newCount = 0;
	let staleCount = 0;
	let currentCount = 0;

	for (const title of titles) {
		const currentTs = currentTimestamps[title];
		if (!currentTs) {
			console.warn(`  no revision timestamp for "${title}" - skipping`);
			continue;
		}
		const known = manifest.bosses[title];
		if (!known) {
			newCount++;
			toFetch.push({ title, wikiRevisionTimestamp: currentTs });
		} else if (known.wikiRevisionTimestamp !== currentTs) {
			staleCount++;
			toFetch.push({ title, wikiRevisionTimestamp: currentTs });
		} else {
			currentCount++;
		}
	}

	mkdirSync(DATA_DIR, { recursive: true });
	writeFileSync(
		TO_FETCH_PATH,
		JSON.stringify({ generatedAt: new Date().toISOString(), bosses: toFetch }, null, 2)
	);

	console.log(
		`\nNew: ${newCount}, stale: ${staleCount}, already current (skipped): ${currentCount}`
	);
	console.log(`Wrote ${toFetch.length} boss(es) to fetch -> ${TO_FETCH_PATH}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
