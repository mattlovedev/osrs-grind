// Stage 1: fetch raw data.
//
// Reads scripts/.data/to-fetch.json (written by stage 0), and for each
// boss listed there, queries the wiki's Bucket API for its own infobox
// data (name, icon, combat level) and its full drop table (Dropsline),
// writing one raw JSON file per boss to scripts/.data/raw/<slug>.json.
// Updates the manifest with each successfully-fetched boss's revision
// timestamp so future stage-0 runs can correctly skip it until it changes.
//
// This is the only stage that talks to the wiki for actual content (stage
// 0 only checks timestamps) - deliberately does no filtering/normalization
// beyond parsing drop_json, so stage 2 can be re-run against this output
// with different filtering logic without ever re-fetching from the wiki.
//
// Usage: node scripts/01-fetch-raw.mjs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { bucketQuery, bucketStringLiteral, fileRefToImageUrl, slugify } from './lib/wiki.mjs';

const DATA_DIR = path.join(process.cwd(), 'scripts', '.data');
const TO_FETCH_PATH = path.join(DATA_DIR, 'to-fetch.json');
const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.json');
const RAW_DIR = path.join(DATA_DIR, 'raw');

function loadManifest() {
	if (!existsSync(MANIFEST_PATH)) return { updatedAt: null, bosses: {} };
	return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

async function fetchMonsterInfo(title) {
	const rows = await bucketQuery(
		`bucket("infobox_monster").select("name","image","combat_level").where("page_name",${bucketStringLiteral(title)}).run()`
	);
	const row = rows[0];
	if (!row) return { name: title, iconUrl: null, combatLevel: null };
	const fileRef = row.image?.[0] ?? null;
	return {
		name: row.name ?? title,
		iconUrl: fileRef ? fileRefToImageUrl(fileRef) : null,
		combatLevel: row.combat_level ?? null
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
	if (!existsSync(TO_FETCH_PATH)) {
		console.error(`${TO_FETCH_PATH} not found - run stage 0 first.`);
		process.exit(1);
	}
	const toFetch = JSON.parse(readFileSync(TO_FETCH_PATH, 'utf8'));
	if (toFetch.bosses.length === 0) {
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
	for (const { title, wikiRevisionTimestamp } of toFetch.bosses) {
		const slug = slugify(title);
		const rawFile = path.join('scripts', '.data', 'raw', `${slug}.json`);
		const rawPath = path.join(RAW_DIR, `${slug}.json`);

		// Reclaim a boss already on disk at this revision - lets a run that
		// died partway (e.g. a rate-limit) resume without re-fetching it, even
		// though the crash meant its manifest entry was lost.
		if (existsSync(rawPath)) {
			try {
				const prev = JSON.parse(readFileSync(rawPath, 'utf8'));
				if (prev.wikiRevisionTimestamp === wikiRevisionTimestamp) {
					manifest.bosses[title] = { wikiRevisionTimestamp, rawFile };
					saveManifest();
					skipped++;
					continue;
				}
			} catch {
				// unreadable/partial file - fall through and re-fetch
			}
		}

		console.log(`Fetching "${title}"...`);
		const [monster, drops] = await Promise.all([fetchMonsterInfo(title), fetchDrops(title)]);
		const raw = {
			fetchedAt: new Date().toISOString(),
			wikiRevisionTimestamp,
			title,
			...monster,
			drops
		};
		writeFileSync(rawPath, JSON.stringify(raw, null, 2));
		console.log(`  -> ${drops.length} drop(s), icon: ${monster.iconUrl ? 'found' : 'MISSING'}`);

		manifest.bosses[title] = { wikiRevisionTimestamp, rawFile };
		saveManifest();
		fetched++;
	}

	console.log(`\nFetched ${fetched} boss(es), ${skipped} already on disk. Manifest updated.`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
