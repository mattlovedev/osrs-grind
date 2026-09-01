const API = 'https://oldschool.runescape.wiki/api.php';

// Identifies this tool to the wiki's API - basic etiquette for scripted
// access, not strictly required but polite (and some wikis rate-limit
// unidentified/default user agents more aggressively).
const USER_AGENT = 'osrs-grind-scraper/0.1 (personal grind-tracker project)';

// Minimum gap between API requests, and retry policy for rate limiting.
// api.php enforces a rate limit (seen 429s on a full boss run); image
// downloads from /images/ are CDN-cached and not throttled here.
const API_MIN_GAP_MS = 200;
const MAX_RETRIES = 6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, headers) {
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(url, { headers });
		if ((res.status !== 429 && res.status !== 503) || attempt >= MAX_RETRIES) return res;
		const retryAfter = Number(res.headers.get('retry-after'));
		const backoff =
			Number.isFinite(retryAfter) && retryAfter > 0
				? retryAfter * 1000
				: Math.min(30_000, 1_000 * 2 ** attempt) + Math.random() * 500;
		console.warn(
			`  wiki ${res.status}; retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(backoff)}ms`
		);
		await sleep(backoff);
	}
}

// Serialise every api.php call through one queue with a fixed minimum gap,
// so concurrent callers (e.g. Promise.all per boss) don't burst past the
// rate limit.
let apiQueue = Promise.resolve();
let lastApiAt = 0;
function apiFetch(url, headers) {
	const run = async () => {
		const wait = API_MIN_GAP_MS - (Date.now() - lastApiAt);
		if (wait > 0) await sleep(wait);
		lastApiAt = Date.now();
		return fetchWithRetry(url, headers);
	};
	const p = apiQueue.then(run, run);
	apiQueue = p.then(
		() => {},
		() => {}
	);
	return p;
}

async function apiGet(params) {
	const url = new URL(API);
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}
	const res = await apiFetch(url, { 'User-Agent': USER_AGENT });
	if (!res.ok) {
		throw new Error(`Wiki API request failed: ${res.status} ${res.statusText} (${url})`);
	}
	return res.json();
}

/** Download a binary resource (e.g. an icon image) as a Buffer. Throws on non-2xx. */
export async function downloadBinary(url) {
	const res = await fetchWithRetry(url, { 'User-Agent': USER_AGENT });
	if (!res.ok) {
		throw new Error(`Download failed: ${res.status} ${res.statusText} (${url})`);
	}
	return Buffer.from(await res.arrayBuffer());
}

/**
 * Fetch every article title in a category, following pagination. Restricted
 * to the main namespace (cmnamespace=0) so Category: and File: members -
 * e.g. ~170 of Category:Bosses' entries - don't leak in as fake pages.
 */
export async function fetchAllCategoryMembers(category) {
	const titles = [];
	let cmcontinue;
	do {
		const data = await apiGet({
			action: 'query',
			list: 'categorymembers',
			cmtitle: category,
			cmnamespace: '0',
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
