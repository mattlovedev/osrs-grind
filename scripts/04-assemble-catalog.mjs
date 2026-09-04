// Stage 4: assemble the final catalog.
//
// Combines the earlier stages' outputs into one flat file the app imports
// directly (no runtime wiki dependency):
//   - skills   : the static 24-skill list
//   - bosses   : name + combat level from stage 1's raw files tagged "boss"
//                (Category:Bosses, unchanged by the monsters addition)
//   - monsters : same, but for raw files tagged "slayer" and NOT "boss" -
//                Category:Slayer monsters minus anything already a boss, so
//                a monster in both categories (e.g. Vorkath) only shows up
//                once, as a boss. A raw file with no `source` field at all
//                predates that field and is treated as "boss" (see stage 1).
//   - items    : the merged list from stage 2c (scripts/.data/items.json)
//   - minigames : name + icon from stage 5's raw files
//                 (scripts/.data/raw-minigames/*.json)
//
// Each entry gets { name, wikiLink, icon }, where `icon` is the local
// /icons/<category>/<file> path from stage 3's manifest
// (scripts/.data/icons.json), or null if that icon wasn't downloaded.
// This path is environment-agnostic on purpose: the app decides at render
// time (src/lib/icon-url.ts) whether to serve it locally (dev - reads
// straight from static/icons/, so newly-downloaded icons show up
// immediately, no publish step needed) or prefix it with the
// osrs-grind-icons GCS base URL (production - see DESIGN.md "Roadmap -
// deployment"). This stage never uploads anything to GCS itself; that's
// `gcloud storage rsync -r static/icons gs://osrs-grind-icons/icons`, run
// separately whenever you're ready to publish. Bosses and monsters also
// carry `combatLevel`.
//
// Output: src/lib/data/catalog.json (committed - this is what the search
// endpoint will `import`).
//
// Usage: node scripts/04-assemble-catalog.mjs

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { wikiPageUrl } from './lib/wiki.mjs';
import { SKILLS } from './lib/skills.mjs';

const CWD = process.cwd();
const DATA_DIR = path.join(CWD, 'scripts', '.data');
const RAW_DIR = path.join(DATA_DIR, 'raw');
const RAW_MINIGAMES_DIR = path.join(DATA_DIR, 'raw-minigames');
const ITEMS_PATH = path.join(DATA_DIR, 'items.json');
const ICONS_MANIFEST = path.join(DATA_DIR, 'icons.json');
const OUT_PATH = path.join(CWD, 'src', 'lib', 'data', 'catalog.json');

const SOURCE = 'https://oldschool.runescape.wiki (Bucket API)';

function readJson(p) {
	return JSON.parse(readFileSync(p, 'utf8'));
}

function byName(a, b) {
	return a.name.localeCompare(b.name);
}

function main() {
	if (!existsSync(ITEMS_PATH)) {
		console.error(`${ITEMS_PATH} not found - run stage 2c first.`);
		process.exit(1);
	}

	const iconMap = existsSync(ICONS_MANIFEST)
		? readJson(ICONS_MANIFEST).icons
		: { skills: {}, bosses: {}, items: {}, minigames: {} };
	if (!existsSync(ICONS_MANIFEST)) {
		console.warn(`  ${ICONS_MANIFEST} missing - every icon will be null (run stage 3).`);
	}
	const iconFor = (category, name) => iconMap[category]?.[name] ?? null;

	const skills = SKILLS.map((name) => ({
		name,
		wikiLink: wikiPageUrl(name),
		icon: iconFor('skills', name)
	})).sort(byName);

	const bosses = [];
	const monsters = [];
	if (existsSync(RAW_DIR)) {
		for (const f of readdirSync(RAW_DIR).filter((f) => f.endsWith('.json'))) {
			const raw = readJson(path.join(RAW_DIR, f));
			const name = raw.name ?? raw.title;
			const source = raw.source ?? ['boss'];
			const isBoss = source.includes('boss');
			const entry = {
				name,
				wikiLink: wikiPageUrl(raw.title ?? name),
				icon: iconFor(isBoss ? 'bosses' : 'monsters', name),
				combatLevel: raw.combatLevel ?? null
			};
			(isBoss ? bosses : monsters).push(entry);
		}
		bosses.sort(byName);
		monsters.sort(byName);
	} else {
		console.warn(`  ${RAW_DIR} missing - no bosses/monsters in the catalog (run stages 0-1).`);
	}

	const items = readJson(ITEMS_PATH)
		.items.map((it) => ({
			name: it.name,
			wikiLink: it.wikiLink ?? wikiPageUrl(it.name),
			icon: iconFor('items', it.name)
		}))
		.sort(byName);

	const minigames = [];
	if (existsSync(RAW_MINIGAMES_DIR)) {
		for (const f of readdirSync(RAW_MINIGAMES_DIR).filter((f) => f.endsWith('.json'))) {
			const raw = readJson(path.join(RAW_MINIGAMES_DIR, f));
			const name = raw.name ?? raw.title;
			minigames.push({
				name,
				wikiLink: wikiPageUrl(raw.title ?? name),
				icon: iconFor('minigames', name)
			});
		}
		minigames.sort(byName);
	} else {
		console.warn(`  ${RAW_MINIGAMES_DIR} missing - no minigames in the catalog (run stage 5).`);
	}

	const catalog = {
		generatedAt: new Date().toISOString(),
		source: SOURCE,
		counts: {
			skills: skills.length,
			bosses: bosses.length,
			monsters: monsters.length,
			items: items.length,
			minigames: minigames.length
		},
		skills,
		bosses,
		monsters,
		items,
		minigames
	};

	mkdirSync(path.dirname(OUT_PATH), { recursive: true });
	writeFileSync(OUT_PATH, JSON.stringify(catalog, null, 2) + '\n');

	const nullIcons = (list) => list.filter((e) => !e.icon).length;
	console.log(`Wrote ${OUT_PATH}`);
	console.log(
		`  skills:   ${skills.length} (${nullIcons(skills)} no icon)\n` +
			`  bosses:   ${bosses.length} (${nullIcons(bosses)} no icon)\n` +
			`  monsters: ${monsters.length} (${nullIcons(monsters)} no icon)\n` +
			`  items:    ${items.length} (${nullIcons(items)} no icon)\n` +
			`  minigames: ${minigames.length} (${nullIcons(minigames)} no icon)`
	);
}

main();
