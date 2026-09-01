const API = 'https://oldschool.runescape.wiki/api.php';

// Identifies this tool to the wiki's API - basic etiquette for scripted
// access, not strictly required but polite (and some wikis rate-limit
// unidentified/default user agents more aggressively).
const USER_AGENT = 'osrs-grind-scraper/0.1 (personal grind-tracker project)';

async function apiGet(params) {
	const url = new URL(API);
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}
	const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
	if (!res.ok) {
		throw new Error(`Wiki API request failed: ${res.status} ${res.statusText} (${url})`);
	}
	return res.json();
}

/** Fetch every page title in a category, following pagination. */
export async function fetchAllCategoryMembers(category) {
	const titles = [];
	let cmcontinue;
	do {
		const data = await apiGet({
			action: 'query',
			list: 'categorymembers',
			cmtitle: category,
			cmlimit: '500',
			format: 'json',
			...(cmcontinue ? { cmcontinue } : {})
		});
		titles.push(...data.query.categorymembers.map((m) => m.title));
		cmcontinue = data.continue?.cmcontinue;
	} while (cmcontinue);
	return titles;
}

/**
 * Fetch the last content-revision timestamp for a batch of page titles.
 * Returns a map of title -> ISO timestamp string. Titles with no
 * revisions (shouldn't happen for real pages) are simply omitted.
 */
export async function fetchRevisionTimestamps(titles) {
	const result = {};
	const CHUNK_SIZE = 50; // MediaWiki API cap for non-bot accounts
	for (let i = 0; i < titles.length; i += CHUNK_SIZE) {
		const chunk = titles.slice(i, i + CHUNK_SIZE);
		const data = await apiGet({
			action: 'query',
			titles: chunk.join('|'),
			prop: 'revisions',
			rvprop: 'timestamp',
			format: 'json'
		});
		for (const page of Object.values(data.query.pages)) {
			if (page.revisions?.[0]?.timestamp) {
				result[page.title] = page.revisions[0].timestamp;
			}
		}
	}
	return result;
}

export { apiGet };
