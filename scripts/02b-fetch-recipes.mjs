// Stage 2b: fetch skill-derivable (recipe) items.
//
// Queries Bucket:Recipe once per skill (`.where("uses_skill", <skill>)`),
// pulls each row's production_json, and keeps the ones that actually
// produce an item. Each becomes a catalog item with its output name, the
// icon the recipe itself declares (output.image - no Infobox_item lookup
// needed), a derived wiki link, and the gating skill/level pairs (kept for
// later result ranking). Writes scripts/.data/recipe-items.json.
//
// Per-skill queries because Bucket caps results at 5,000 rows and the full
// Recipe table is over that; every individual skill is well under (Crafting
// is ~800). Rows whose production_json has no real `output` object (agility
// courses, quest steps) are skipped.
//
// Run before 02c-flatten-items.mjs. Re-run any time; it's ~24 quick queries.
//
// Usage:
//   node scripts/02b-fetch-recipes.mjs
//   node scripts/02b-fetch-recipes.mjs --only="Crafting"
//   node scripts/02b-fetch-recipes.mjs --only="Crafting,Smithing" --limit=20

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { bucketQuery, bucketStringLiteral, fileRefToImageUrl, wikiPageUrl } from './lib/wiki.mjs';

const DATA_DIR = path.join(process.cwd(), 'scripts', '.data');
const OUT_PATH = path.join(DATA_DIR, 'recipe-items.json');
const ROW_LIMIT = 5000;

// All 24 skills (incl. Sailing). Combat skills have no recipes and just
// return zero rows - harmless, and cheaper than maintaining a "which skills
// can produce items" list that drifts as the game adds content.
const SKILLS = [
	'Attack',
	'Strength',
	'Defence',
	'Ranged',
	'Prayer',
	'Magic',
	'Runecraft',
	'Construction',
	'Hitpoints',
	'Agility',
	'Herblore',
	'Thieving',
	'Crafting',
	'Fletching',
	'Slayer',
	'Hunter',
	'Mining',
	'Smithing',
	'Fishing',
	'Cooking',
	'Firemaking',
	'Woodcutting',
	'Farming',
	'Sailing'
];

function parseArgs(argv) {
	const onlyArg = argv.find((a) => a.startsWith('--only='));
	const limitArg = argv.find((a) => a.startsWith('--limit='));
	return {
		only: onlyArg
			? onlyArg
					.slice('--only='.length)
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean)
			: null,
		limit: limitArg ? Number(limitArg.slice('--limit='.length)) : null
	};
}

async function fetchRecipeRows(skill) {
	return bucketQuery(
		`bucket("recipe").select("production_json").where("uses_skill",${bucketStringLiteral(skill)}).limit(${ROW_LIMIT}).run()`
	);
}

// production_json.skills -> [{ skill, level }] (level null when non-numeric
// e.g. "Varies").
function parseSkillReqs(pj) {
	return (pj.skills ?? [])
		.filter((s) => s && s.name)
		.map((s) => ({
			skill: s.name,
			level: Number.isFinite(Number(s.level)) ? Number(s.level) : null
		}));
}

async function main() {
	const { only, limit } = parseArgs(process.argv.slice(2));
	const skills = only ?? SKILLS;

	const byName = new Map();
	let parseFailures = 0;

	for (const skill of skills) {
		const rows = await fetchRecipeRows(skill);
		if (rows.length >= ROW_LIMIT) {
			console.warn(`  ${skill}: hit the ${ROW_LIMIT}-row cap - results may be truncated.`);
		}

		let withOutput = 0;
		for (const row of rows) {
			let pj;
			try {
				pj = JSON.parse(row.production_json);
			} catch {
				parseFailures++;
				continue;
			}
			const output = pj.output;
			if (!output || typeof output !== 'object' || !output.name) continue;
			withOutput++;

			const name = output.name;
			const entry = byName.get(name) ?? {
				name,
				wikiLink: wikiPageUrl(name),
				iconUrl: output.image ? fileRefToImageUrl(output.image) : null,
				skills: []
			};
			if (!entry.iconUrl && output.image) entry.iconUrl = fileRefToImageUrl(output.image);
			for (const req of parseSkillReqs(pj)) {
				if (!entry.skills.some((s) => s.skill === req.skill && s.level === req.level)) {
					entry.skills.push(req);
				}
			}
			byName.set(name, entry);
		}

		console.log(`${skill}: ${rows.length} row(s), ${withOutput} with an output item`);
	}

	let items = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
	if (limit) {
		items = items.slice(0, limit);
		console.log(`Limited to first ${limit}.`);
	}

	mkdirSync(DATA_DIR, { recursive: true });
	writeFileSync(
		OUT_PATH,
		JSON.stringify({ generatedAt: new Date().toISOString(), count: items.length, items }, null, 2)
	);

	const noIcon = items.filter((i) => !i.iconUrl).length;
	console.log(`\nWrote ${items.length} unique recipe item(s) -> ${OUT_PATH}`);
	if (parseFailures) console.log(`  ${parseFailures} row(s) had unparseable production_json`);
	if (noIcon) console.log(`  ${noIcon} item(s) with no output.image (iconUrl: null)`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
