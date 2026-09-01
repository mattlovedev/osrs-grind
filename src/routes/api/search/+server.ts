import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { EntryType } from '$lib/types';
import catalog from '$lib/data/catalog.json';

// Self-contained catalog search. Reads the build-time-bundled catalog JSON
// (no Firestore, no wiki), scans it in memory, returns ranked matches as
// plain JSON - callable by anything (curl, the frontend, a future client).
//
//   GET /api/search?q=berserker
//   GET /api/search?q=ring&type=item&limit=10
//   GET /api/search?q=dagannoth&type=boss,item

interface CatalogEntry {
	name: string;
	wikiLink: string;
	icon: string | null;
	combatLevel?: number | null;
}

interface Indexed {
	type: EntryType;
	name: string;
	wikiLink: string;
	icon: string | null;
	combatLevel?: number | null;
	lower: string;
}

function index(entries: CatalogEntry[], type: EntryType): Indexed[] {
	return entries.map((e) => ({
		type,
		name: e.name,
		wikiLink: e.wikiLink,
		icon: e.icon,
		...(type === 'boss' ? { combatLevel: e.combatLevel ?? null } : {}),
		lower: e.name.toLowerCase()
	}));
}

// Built once per server instance.
const ENTRIES: Indexed[] = [
	...index(catalog.skills, 'skill'),
	...index(catalog.bosses, 'boss'),
	...index(catalog.items, 'item'),
	...index(catalog.minigames, 'minigame')
];

const ALL_TYPES: EntryType[] = ['skill', 'boss', 'item', 'minigame'];
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

// Lower score = better match. -1 means no match.
function score(lowerName: string, q: string): number {
	if (lowerName === q) return 0;
	if (lowerName.startsWith(q)) return 1;
	if (lowerName.includes(` ${q}`)) return 2; // start of a later word
	if (lowerName.includes(q)) return 3;
	return -1;
}

export const GET: RequestHandler = ({ url }) => {
	const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();

	const typeParam = url.searchParams.get('type');
	const types = typeParam
		? (typeParam.split(',').map((s) => s.trim()) as EntryType[]).filter((t) =>
				ALL_TYPES.includes(t)
			)
		: ALL_TYPES;

	const limitParam = Number(url.searchParams.get('limit'));
	const limit =
		Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT;

	if (!q) return json({ query: q, count: 0, results: [] });

	const matches: { entry: Indexed; s: number }[] = [];
	for (const entry of ENTRIES) {
		if (!types.includes(entry.type)) continue;
		const s = score(entry.lower, q);
		if (s >= 0) matches.push({ entry, s });
	}

	matches.sort(
		(a, b) =>
			a.s - b.s ||
			a.entry.name.length - b.entry.name.length ||
			a.entry.name.localeCompare(b.entry.name)
	);

	const results = matches.slice(0, limit).map(({ entry }) => {
		const { lower: _lower, ...rest } = entry;
		return rest;
	});

	return json({ query: q, count: matches.length, results });
};
