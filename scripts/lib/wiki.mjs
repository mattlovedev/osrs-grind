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

/**
 * Run a Bucket query DSL string (e.g. `bucket("dropsline").select(...).run()`)
 * against the wiki's structured-data extension. Returns the array of result
 * rows (empty array if none).
 */
export async function bucketQuery(query) {
	const data = await apiGet({ action: 'bucket', query, format: 'json' });
	if (data.error) {
		// data.error is sometimes a plain string, sometimes {info,code}.
		const detail =
			typeof data.error === 'string' ? data.error : (data.error.info ?? data.error.code);
		throw new Error(`Bucket query failed: ${detail} (${query})`);
	}
	return data.bucket ?? [];
}

/** Escape double quotes so a title/name is safe to embed in a Bucket query string literal. */
export function bucketStringLiteral(value) {
	return `"${value.replace(/"/g, '\\"')}"`;
}

/** Convert a wiki "File:X.png" reference into its direct downloadable image URL. */
export function fileRefToImageUrl(fileRef) {
	const filename = fileRef.replace(/^File:/, '').replace(/ /g, '_');
	return `https://oldschool.runescape.wiki/images/${encodeURIComponent(filename).replace(/%2F/g, '/')}`;
}

/** Direct URL to a wiki article page for a given page title. */
export function wikiPageUrl(pageName) {
	const slug = encodeURIComponent(pageName.replace(/ /g, '_'))
		.replace(/%2F/g, '/')
		.replace(/%3A/g, ':')
		.replace(/%2C/g, ',');
	return `https://oldschool.runescape.wiki/w/${slug}`;
}

/** Turn a wiki page title into a filesystem-safe kebab-case slug. */
export function slugify(title) {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export { apiGet };
