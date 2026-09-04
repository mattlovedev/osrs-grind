// Stage 6: fetch quests.
//
// Every quest is catalogued as a plain name + its own wiki link, all
// sharing one fixed icon (see stage 3) - there's no per-quest icon or
// other data to resolve, so unlike bosses/monsters/minigames this stage
// needs no per-page raw file, no staleness cache, and no --refresh: a
// full re-scan is cheap (Category:Quests enumeration plus a handful of
// batched template-membership checks) and always safe to just re-run.
//
// Category:Quests (namespace 0) is 224 pages, but 28 of those are
// overview/list/reward/meta articles that happen to sit in the same
// category ("Quests/List", "Quest Difficulties", "Quests" itself, "Quest
// points", ...) - not real quests, giving 196. There's no Bucket table
// for quests to filter against (`infobox_quest` doesn't exist), so this
// checks each page's own membership in Template:Infobox Quest instead,
// via a batched prop=templates query (up to 50 titles/call - the standard
// MediaWiki page-batch limit) rather than fetching full wikitext per
// page. Verified this correctly keeps sub-quest pages that also use the
// template (e.g. "Recipe for Disaster/Freeing Pirate Pete", one of ten
// separately completable Recipe for Disaster sub-quests) while dropping
// the overview pages - a plain "does the title contain a slash" heuristic
// would have wrongly excluded those ten. Four category members end up
// excluded too despite sounding quest-like ("Burial at Sea", "An
// Existential Crisis", "Impending Chaos", "Rocking Out") - checked their
// wikitext directly, none of them have any infobox at all, standard
// {{Infobox Quest}} or otherwise, so whatever they are, it's not a
// structured/trackable quest in the sense this catalog means.
//
// Output: scripts/.data/quests.json, shape { generatedAt, quests: [{
// title }] } - a single flattened file (like stage 2c's items.json),
// not one-file-per-page like raw/ or raw-minigames/, since there's no
// per-page data worth tracking individually.
//
// Usage: node scripts/06-fetch-quests.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { apiGet, fetchAllCategoryMembers } from './lib/wiki.mjs';

const DATA_DIR = path.join(process.cwd(), 'scripts', '.data');
const OUT_PATH = path.join(DATA_DIR, 'quests.json');
const CATEGORY = 'Category:Quests';
const QUEST_TEMPLATE = 'Template:Infobox Quest';
const CHUNK_SIZE = 50;

// Batched: which of these titles actually transclude Template:Infobox
// Quest (i.e. are real quest pages, not overview/list articles that just
// happen to sit in Category:Quests)? Returns the filtered subset.
//
// prop=templates paginates *within* a single call once the batch's total
// template-list results exceed the API's per-request budget, even at 50
// titles with tltemplates already narrowed to one specific template - the
// first version of this dropped ~150 real quests (Dragon Slayer II,
// Cabin Fever, Fight Arena, Monkey Madness I, ...) as "excluded" because
// their titles just happened to fall past that budget in the batch and
// never got a `templates` field at all, not because they lacked the
// template. tllimit=max avoids needing the tlcontinue loop in practice
// (verified: zero chunks needed a second call against the live wiki), but
// the loop stays as a correctness guarantee, not a hopeful optimization.
async function filterToRealQuests(titles) {
	const real = [];
	for (let i = 0; i < titles.length; i += CHUNK_SIZE) {
		const chunk = titles.slice(i, i + CHUNK_SIZE);
		const hasTemplate = new Set();
		let tlcontinue;
		do {
			const data = await apiGet({
				action: 'query',
				prop: 'templates',
				titles: chunk.join('|'),
				tltemplates: QUEST_TEMPLATE,
				tllimit: 'max',
				format: 'json',
				...(tlcontinue ? { tlcontinue } : {})
			});
			for (const page of Object.values(data.query?.pages ?? {})) {
				if (page.templates?.length) hasTemplate.add(page.title);
			}
			tlcontinue = data.continue?.tlcontinue;
		} while (tlcontinue);
		for (const title of chunk) {
			if (hasTemplate.has(title)) real.push(title);
		}
		console.log(`  checked ${Math.min(i + CHUNK_SIZE, titles.length)}/${titles.length}`);
	}
	return real;
}

async function main() {
	console.log(`Fetching ${CATEGORY}...`);
	const titles = await fetchAllCategoryMembers(CATEGORY);
	console.log(`  ${titles.length} page(s) - checking which transclude ${QUEST_TEMPLATE}...`);

	const questTitles = await filterToRealQuests(titles);
	questTitles.sort();

	mkdirSync(DATA_DIR, { recursive: true });
	writeFileSync(
		OUT_PATH,
		JSON.stringify(
			{ generatedAt: new Date().toISOString(), quests: questTitles.map((title) => ({ title })) },
			null,
			2
		)
	);

	console.log(
		`\n${questTitles.length} real quest page(s) (${titles.length - questTitles.length} category member(s) excluded as overview/meta pages).`
	);
	console.log(`Wrote ${OUT_PATH}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
