// Stage 0: discover & stale-check.
//
// Enumerates every wiki category in MONSTER_CATEGORIES (currently
// Category:Bosses and Category:Slayer monsters), unions them into one
// deduped title list tagged with which categor(y/ies) each page matched,
// checks each page's last content-revision timestamp against what we
// already know from a previous run (scripts/.data/manifest.json), and
// writes the list of pages that are new or changed to
// scripts/.data/to-fetch.json for stage 1 to process.
//
// This stage never fetches drop/infobox data itself - only cheap, batched
// timestamp checks - so it's safe/fast to run at full scope every time,
// even while later stages are still being scoped down for testing.
//
// Usage:
//   node scripts/00-discover.mjs                                  # everything
//   node scripts/00-discover.mjs --limit=5                        # first 5
//   node scripts/00-discover.mjs --only="Dagannoth Rex,Dagannoth Prime"

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fetchAllCategoryMembers, fetchRevisionTimestamps, slugify } from './lib/wiki.mjs';
import { MONSTER_CATEGORIES } from './lib/monster-categories.mjs';

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
	if (!existsSync(MANIFEST_PATH)) return { updatedAt: null, monsters: {} };
	const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
	// One-time migration: pre-monsters manifests keyed everything under
	// `bosses` (all of it genuinely was Category:Bosses at the time).
	if (!manifest.monsters) manifest.monsters = manifest.bosses ?? {};
	return manifest;
}

async function main() {
	const { only, limit } = parseArgs(process.argv.slice(2));

	// title -> Set of source keys ('boss', 'slayer', ...) it matched.
	const sourcesByTitle = new Map();
	for (const { key, wikiCategory } of MONSTER_CATEGORIES) {
		console.log(`Fetching ${wikiCategory}...`);
		const members = await fetchAllCategoryMembers(wikiCategory);
		console.log(`  ${members.length} page(s).`);
		for (const title of members) {
			if (!sourcesByTitle.has(title)) sourcesByTitle.set(title, new Set());
			sourcesByTitle.get(title).add(key);
		}
	}
	let titles = [...sourcesByTitle.keys()];
	console.log(`${titles.length} unique monster page(s) across all categories.`);

	// Two distinct real wiki pages can slugify to the same string (e.g.
	// "Skeleton (mage)" and "Skeleton Mage" both -> "skeleton-mage" - both
	// verified as real, separate, non-redirect pages). Stage 1 names each
	// raw file by slug, so an undetected collision means one page's data
	// silently overwrites the other's on disk. Resolve it here, before any
	// fetch happens, by giving every title a unique cache-file slug -
	// disambiguating with a numeric suffix rather than dropping either page
	// (this only affects the internal scripts/.data/raw/*.json filename,
	// never the catalog, which keys entries by name/wikiLink instead).
	const slugByTitle = new Map();
	const usedSlugs = new Set();
	for (const title of [...titles].sort()) {
		const base = slugify(title);
		let slug = base;
		let n = 2;
		while (usedSlugs.has(slug)) slug = `${base}-${n++}`;
		if (slug !== base) {
			console.warn(`  slug collision: "${title}" -> "${base}" already taken, using "${slug}"`);
		}
		usedSlugs.add(slug);
		slugByTitle.set(title, slug);
	}

	if (only) {
		titles = titles.filter((t) => only.includes(t));
		console.log(`Filtered to --only list: ${titles.join(', ')}`);
	}
	if (limit) {
		titles = titles.slice(0, limit);
		console.log(`Limited to first ${limit}.`);
	}

	console.log(`Checking staleness for ${titles.length} page(s)...`);
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
		const sources = [...sourcesByTitle.get(title)].sort();
		const slug = slugByTitle.get(title);
		const rawFile = path.join('scripts', '.data', 'raw', `${slug}.json`);
		const known = manifest.monsters[title];
		// A rawFile mismatch means this title's slug assignment changed since
		// the last run (e.g. a newly-detected collision moved it) - force a
		// re-fetch even if the revision is unchanged, since the file at its
		// old path may hold a different page's data entirely (see stage 0's
		// slug-collision comment above).
		if (!known) {
			newCount++;
			toFetch.push({ title, wikiRevisionTimestamp: currentTs, sources, slug });
		} else if (known.wikiRevisionTimestamp !== currentTs || known.rawFile !== rawFile) {
			staleCount++;
			toFetch.push({ title, wikiRevisionTimestamp: currentTs, sources, slug });
		} else {
			currentCount++;
		}
	}

	mkdirSync(DATA_DIR, { recursive: true });
	writeFileSync(
		TO_FETCH_PATH,
		JSON.stringify({ generatedAt: new Date().toISOString(), monsters: toFetch }, null, 2)
	);

	console.log(
		`\nNew: ${newCount}, stale: ${staleCount}, already current (skipped): ${currentCount}`
	);
	console.log(`Wrote ${toFetch.length} page(s) to fetch -> ${TO_FETCH_PATH}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
