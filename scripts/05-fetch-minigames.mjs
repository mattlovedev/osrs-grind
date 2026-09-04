// Stage 5: fetch minigames.
//
// Minigames get their own small, self-contained stage rather than reusing
// the boss/monster pipeline (stages 0-1): there's no drop table, no combat
// level, and only ~50 pages total (Category:Minigames), so the cheap-
// timestamp-precheck-then-fetch split that scale justifies for bosses/
// monsters would just be extra ceremony here. This one script discovers,
// checks staleness against its own raw files (no separate manifest), and
// fetches in one pass.
//
// Enumerates Category:Minigames (namespace 0 - drops the "Minigames"
// overview article itself the same way it's dropped everywhere else: it
// has no Infobox Activity row, so the bucket check below skips it like any
// other non-activity page).
//
// Icon sourcing was the hard part here. Unlike Infobox_monster/Infobox_item,
// `Infobox Activity`'s own `image` field is a full gameplay screenshot
// (verified: Barbarian Assault's is "Barbarian Assault gameplay.png",
// 300px) - not a small icon, and there's no dedicated icon/logo parameter
// in the template. What most (not all) minigame articles do instead is
// place a `[[File:<Name> logo.png]]` reference on its own line immediately
// after the infobox closes - Category:Minigame icons documents some but
// not all of these (21 of ~50), so the reliable way to find one is to read
// each page's own wikitext. Preference order per page:
//   1. The logo file referenced right after the infobox (small, on-brand).
//   2. Infobox Activity's `image` field (a screenshot, but better than
//      nothing - recall over precision, same stance as the item catalog).
//   3. null (no icon downloaded, frontend shows a placeholder).
//
// Output: one raw JSON file per page at
// scripts/.data/raw-minigames/<slug>.json, shape:
//   { fetchedAt, wikiRevisionTimestamp, title, name, iconUrl }
// Stage 3 (icon download) and stage 4 (assemble) read this directory the
// same way they read scripts/.data/raw/ for bosses/monsters.
//
// Usage:
//   node scripts/05-fetch-minigames.mjs
//   node scripts/05-fetch-minigames.mjs --refresh   # ignore cached raw files

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
	apiGet,
	bucketQuery,
	bucketStringLiteral,
	fetchAllCategoryMembers,
	fetchRevisionTimestamps,
	fileRefToImageUrl,
	slugify
} from './lib/wiki.mjs';

const RAW_DIR = path.join(process.cwd(), 'scripts', '.data', 'raw-minigames');
const CATEGORY = 'Category:Minigames';

function parseArgs(argv) {
	return { refresh: argv.includes('--refresh') };
}

// Finds the `[[File:...]]` reference conventionally placed right after an
// infobox's closing `}}` (alone on its own line, so this doesn't false-
// match a `}}` that closes a template nested *inside* the infobox, e.g.
// `|map = {{Map|...}}` - that one isn't followed by a newline then
// `[[File:`). Best-effort convention match, not every page follows it.
function extractLogoFileRef(wikitext) {
	const m = wikitext.match(/\}\}\s*\n\[\[File:([^\]|]+)/);
	return m ? `File:${m[1].trim()}` : null;
}

async function fetchActivityInfo(title) {
	const rows = await bucketQuery(
		`bucket("infobox_activity").select("page_name","image").where("page_name",${bucketStringLiteral(title)}).run()`
	);
	const row = rows[0];
	if (!row) return null; // not a real activity page (e.g. the category overview article)
	return { screenshotFileRef: row.image?.[0] ?? null };
}

async function fetchWikitext(title) {
	const data = await apiGet({
		action: 'parse',
		page: title,
		prop: 'wikitext',
		format: 'json'
	});
	return data.parse?.wikitext?.['*'] ?? '';
}

async function main() {
	const { refresh } = parseArgs(process.argv.slice(2));

	console.log(`Fetching ${CATEGORY}...`);
	const titles = await fetchAllCategoryMembers(CATEGORY);
	console.log(`  ${titles.length} page(s).`);

	console.log(`Checking staleness for ${titles.length} page(s)...`);
	const currentTimestamps = await fetchRevisionTimestamps(titles);

	mkdirSync(RAW_DIR, { recursive: true });

	let fetched = 0;
	let skipped = 0;
	let notAnActivity = 0;
	let withLogo = 0;
	let withScreenshotFallback = 0;
	let withNoIcon = 0;

	for (const title of titles) {
		const currentTs = currentTimestamps[title];
		if (!currentTs) {
			console.warn(`  no revision timestamp for "${title}" - skipping`);
			continue;
		}
		const slug = slugify(title);
		const rawPath = path.join(RAW_DIR, `${slug}.json`);

		if (!refresh && existsSync(rawPath)) {
			try {
				const prev = JSON.parse(readFileSync(rawPath, 'utf8'));
				if (prev.title === title && prev.wikiRevisionTimestamp === currentTs) {
					skipped++;
					continue;
				}
			} catch {
				// unreadable/partial file - fall through and re-fetch
			}
		}

		console.log(`Fetching "${title}"...`);
		const info = await fetchActivityInfo(title);
		if (!info) {
			console.warn(`  no Infobox Activity row - not a real minigame page, skipping`);
			notAnActivity++;
			continue;
		}

		const wikitext = await fetchWikitext(title);
		const logoFileRef = extractLogoFileRef(wikitext);
		const fileRef = logoFileRef ?? info.screenshotFileRef;
		if (logoFileRef) withLogo++;
		else if (info.screenshotFileRef) withScreenshotFallback++;
		else withNoIcon++;

		const raw = {
			fetchedAt: new Date().toISOString(),
			wikiRevisionTimestamp: currentTs,
			title,
			name: title,
			iconUrl: fileRef ? fileRefToImageUrl(fileRef) : null
		};
		writeFileSync(rawPath, JSON.stringify(raw, null, 2));
		console.log(
			`  -> icon: ${logoFileRef ? 'logo' : info.screenshotFileRef ? 'screenshot fallback' : 'MISSING'}`
		);
		fetched++;
	}

	console.log(
		`\nFetched ${fetched} page(s) (${withLogo} with a logo, ${withScreenshotFallback} screenshot ` +
			`fallback, ${withNoIcon} no icon), ${skipped} already current, ` +
			`${notAnActivity} not a real minigame page.`
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
