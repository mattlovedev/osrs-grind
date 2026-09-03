// Wiki categories enumerated for monster pages, each tagged with a short
// source key that gets carried through raw/*.json's `source` field (stages
// 0-1 union and dedupe every category here into one shared fetch - a page
// in two categories is only ever fetched once).
//
// What each source key means for the final catalog is decided at assembly
// time (stage 4), not here: `bosses` stays exactly Category:Bosses;
// `monsters` is Category:Slayer monsters minus anything already a boss, so
// a monster like Vorkath (in both) doesn't show up as two duplicate search
// results. See DESIGN.md "Slayer-task monsters" for the reasoning.
export const MONSTER_CATEGORIES = [
	{ key: 'boss', wikiCategory: 'Category:Bosses' },
	{ key: 'slayer', wikiCategory: 'Category:Slayer monsters' }
];
