// Stage 3: download icons.
//
// Downloads the icon image for every catalog entry to
// static/icons/<category>/<slug>.<ext>, where <slug> is the entry name
// kebab-cased (not the wiki's raw "Dagannoth Rex.png"). Sources:
//   - items    : scripts/.data/items.json    (iconUrl per item; null = skipped)
//   - bosses   : scripts/.data/raw/*.json    (iconUrl per page tagged "boss")
//   - monsters : scripts/.data/raw/*.json    (iconUrl per page tagged "slayer"
//                but not "boss" - see lib/monster-categories.mjs; a raw file
//                with no `source` field at all predates that field and is
//                treated as "boss", matching how it was actually discovered)
//   - skills   : the static 24-skill list; icon URL is "<Skill>_icon.png" on
//                the wiki (verified pattern for all 24)
//   - minigames: scripts/.data/raw-minigames/*.json (iconUrl per page, from
//                stage 5 - a logo file if the page has one, else a gameplay
//                screenshot, else null)
//
// Files already on disk are left alone unless --refresh. Writes a manifest
// (scripts/.data/icons.json) mapping each entry name to its local
// /icons/... path, for stage 4 to build data/catalog.json.
//
// static/icons/ is a local staging directory only (gitignored, never
// served by the app) - the actual public copy lives in the osrs-grind-icons
// GCS bucket. After running this stage, publish with:
//   gcloud storage rsync -r static/icons gs://osrs-grind-icons/icons
// Stage 4 turns this manifest's local /icons/... paths into the bucket's
// public URLs - see its GCS_ICON_BASE_URL. See DESIGN.md "Roadmap -
// deployment" for the reasoning (icons served straight from GCS, never
// baked into the Cloud Run image).
//
// Usage:
//   node scripts/03-download-icons.mjs
//   node scripts/03-download-icons.mjs --refresh        # re-download everything
//   node scripts/03-download-icons.mjs --limit=50       # first 50 per category (dev)

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { apiGet, downloadBinary, slugify } from './lib/wiki.mjs';
import { SKILLS } from './lib/skills.mjs';

const CWD = process.cwd();
const DATA_DIR = path.join(CWD, 'scripts', '.data');
const RAW_DIR = path.join(DATA_DIR, 'raw');
const RAW_MINIGAMES_DIR = path.join(DATA_DIR, 'raw-minigames');
const ITEMS_PATH = path.join(DATA_DIR, 'items.json');
const ICONS_MANIFEST = path.join(DATA_DIR, 'icons.json');
const STATIC_ICONS = path.join(CWD, 'static', 'icons');

const CONCURRENCY = 8;

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

function extFromUrl(url) {
	const ext = path.extname(new URL(url).pathname).toLowerCase();
	return /^\.(png|gif|jpg|jpeg|webp)$/.test(ext) ? ext : '.png';
}

// Recover "File:Foo bar(5).png" from a hand-built .../images/Foo_bar(5).png URL.
function fileTitleFromUrl(url) {
	const base = decodeURIComponent(new URL(url).pathname.split('/').pop());
	return `File:${base.replace(/_/g, ' ')}`;
}

// The upstream icon URLs are constructed from `File:` names by string
// munging, which breaks on file-page redirects (e.g. charged-jewellery
// variants) and casing quirks. Resolve them to real URLs via the API's
// imageinfo, which follows redirects. Returns Map<inputUrl, realUrl>;
// URLs that don't resolve are simply absent (caller falls back to input).
async function resolveIconUrls(urls) {
	const titleToUrl = new Map(); // File:title -> input url (dedupes shared icons)
	for (const u of urls) titleToUrl.set(fileTitleFromUrl(u), u);
	const titles = [...titleToUrl.keys()];

	const resolved = new Map();
	for (let i = 0; i < titles.length; i += 50) {
		const chunk = titles.slice(i, i + 50);
		const data = await apiGet({
			action: 'query',
			format: 'json',
			prop: 'imageinfo',
			iiprop: 'url',
			titles: chunk.join('|')
		});
		// Map any title normalisation the API applied back to our chunk titles.
		const norm = new Map((data.query?.normalized ?? []).map((n) => [n.to, n.from]));
		for (const page of Object.values(data.query?.pages ?? {})) {
			const real = page.imageinfo?.[0]?.url;
			if (!real) continue;
			const originalTitle = norm.get(page.title) ?? page.title;
			const inputUrl = titleToUrl.get(originalTitle);
			if (inputUrl) resolved.set(inputUrl, real);
		}
		console.log(`  resolved ${Math.min(i + 50, titles.length)}/${titles.length} icon URLs`);
	}
	return resolved;
}

/** Run `fn` over `items` with a fixed worker pool. */
async function mapPool(items, concurrency, fn) {
	const results = new Array(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, async () => {
			while (next < items.length) {
				const i = next++;
				results[i] = await fn(items[i]);
			}
		})
	);
	return results;
}

// Dedupe a category's entries by slug (so e.g. a quest-instance page and
// the regular monster page - "Giant lobster" vs "Giant Lobster", casing
// the only difference - don't try to write two different files to the
// same /icons/monsters/giant-lobster.png path), and apply the dev --limit.
// A name that loses its slug to an earlier entry isn't dropped outright -
// it's recorded in `aliases` so main() can still give it a manifest entry
// once the canonical one has a resolved local path (same icon, no second
// download). Returns { list: [{category,name,url,slug}], aliases:
// [{category,name,canonicalName}] }.
function dedupeEntries(category, entries, limit) {
	const bySlug = new Map();
	const aliases = [];
	for (const { name, url } of entries) {
		if (!url) continue;
		const slug = slugify(name);
		if (!slug) continue;
		const existing = bySlug.get(slug);
		if (existing && existing.name !== name) {
			console.warn(
				`  slug collision in ${category}: "${existing.name}" and "${name}" -> ${slug} (aliasing "${name}" to "${existing.name}"'s icon)`
			);
			aliases.push({ category, name, canonicalName: existing.name });
			continue;
		}
		if (existing) continue;
		bySlug.set(slug, { category, name, url, slug });
	}
	const list = [...bySlug.values()];
	return { list: limit ? list.slice(0, limit) : list, aliases };
}

// Turn a deduped entry into a download task, naming the file from its
// (already resolved) URL's extension.
function toTask({ category, name, url, slug }) {
	const filename = `${slug}${extFromUrl(url)}`;
	return {
		category,
		name,
		url,
		dest: path.join(STATIC_ICONS, category, filename),
		localPath: `/icons/${category}/${filename}`
	};
}

async function main() {
	const { refresh, limit } = parseArgs(process.argv.slice(2));

	// --- gather sources ---
	if (!existsSync(ITEMS_PATH)) {
		console.error(`${ITEMS_PATH} not found - run stage 2c first.`);
		process.exit(1);
	}
	const itemEntries = readJson(ITEMS_PATH).items.map((it) => ({ name: it.name, url: it.iconUrl }));
	const noIconItems = itemEntries.filter((e) => !e.url).map((e) => e.name);

	const bossEntries = [];
	const monsterEntries = [];
	if (existsSync(RAW_DIR)) {
		for (const f of readdirSync(RAW_DIR).filter((f) => f.endsWith('.json'))) {
			const raw = readJson(path.join(RAW_DIR, f));
			const source = raw.source ?? ['boss'];
			const entry = { name: raw.name ?? raw.title, url: raw.iconUrl };
			if (source.includes('boss')) bossEntries.push(entry);
			else monsterEntries.push(entry);
		}
	}

	const skillEntries = SKILLS.map((name) => ({
		name,
		url: `https://oldschool.runescape.wiki/images/${name}_icon.png`
	}));

	const minigameEntries = [];
	if (existsSync(RAW_MINIGAMES_DIR)) {
		for (const f of readdirSync(RAW_MINIGAMES_DIR).filter((f) => f.endsWith('.json'))) {
			const raw = readJson(path.join(RAW_MINIGAMES_DIR, f));
			minigameEntries.push({ name: raw.name ?? raw.title, url: raw.iconUrl });
		}
	}

	// Dedupe + apply --limit first, so a dev run only resolves/downloads
	// what it will actually use.
	const deduped = [
		dedupeEntries('items', itemEntries, limit),
		dedupeEntries('bosses', bossEntries, limit),
		dedupeEntries('monsters', monsterEntries, limit),
		dedupeEntries('skills', skillEntries, limit),
		dedupeEntries('minigames', minigameEntries, limit)
	];
	const entries = deduped.flatMap((d) => d.list);
	const aliases = deduped.flatMap((d) => d.aliases);

	// Resolve the string-munged URLs to real ones (follows file redirects).
	const rawUrls = [...new Set(entries.map((e) => e.url))];
	console.log(`Resolving ${rawUrls.length} icon URL(s) via imageinfo...`);
	const resolved = await resolveIconUrls(rawUrls);
	for (const e of entries) {
		if (resolved.has(e.url)) e.url = resolved.get(e.url);
	}

	const tasks = entries.map(toTask);

	for (const c of ['items', 'bosses', 'monsters', 'skills', 'minigames']) {
		mkdirSync(path.join(STATIC_ICONS, c), { recursive: true });
	}

	// --- download ---
	let downloaded = 0;
	let skipped = 0;
	const failed = [];
	const manifest = { items: {}, bosses: {}, monsters: {}, skills: {}, minigames: {} };

	await mapPool(tasks, CONCURRENCY, async (task) => {
		if (!refresh && existsSync(task.dest)) {
			skipped++;
			manifest[task.category][task.name] = task.localPath;
			return;
		}
		try {
			writeFileSync(task.dest, await downloadBinary(task.url));
			downloaded++;
			manifest[task.category][task.name] = task.localPath;
		} catch (err) {
			failed.push({ category: task.category, name: task.name, url: task.url, error: String(err) });
		}
		if ((downloaded + failed.length) % 100 === 0) {
			console.log(`  ${downloaded} downloaded, ${skipped} skipped, ${failed.length} failed`);
		}
	});

	// Give every name that lost a slug collision (see dedupeEntries) the
	// same manifest entry as the one that won it, so stage 4 can still find
	// an icon for it - no second download, since it's the same file on disk.
	let aliased = 0;
	for (const { category, name, canonicalName } of aliases) {
		const canonicalPath = manifest[category][canonicalName];
		if (canonicalPath) {
			manifest[category][name] = canonicalPath;
			aliased++;
		}
	}

	mkdirSync(DATA_DIR, { recursive: true });
	writeFileSync(
		ICONS_MANIFEST,
		JSON.stringify(
			{
				generatedAt: new Date().toISOString(),
				counts: { downloaded, skipped, failed: failed.length, aliased, noIcon: noIconItems.length },
				icons: manifest,
				failed,
				noIcon: noIconItems
			},
			null,
			2
		)
	);

	console.log(
		`\n${downloaded} downloaded, ${skipped} already present, ${failed.length} failed, ` +
			`${aliased} aliased onto another entry's icon (slug collision), ` +
			`${noIconItems.length} item(s) had no iconUrl.`
	);
	console.log(`Manifest -> ${ICONS_MANIFEST}`);
	if (failed.length) {
		console.log('\nFailed:');
		for (const f of failed.slice(0, 40)) console.log(`  [${f.category}] ${f.name} - ${f.error}`);
		if (failed.length > 40) console.log(`  ...and ${failed.length - 40} more (see manifest)`);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
