// Kept for the catalog / search endpoint - entries themselves no longer
// carry a type (creation is a single global search, not per-category).
export type EntryType = 'skill' | 'boss' | 'item' | 'minigame';

export interface Entry {
	label: string;
	wikiLink: string;
	icon: string;
	bottomText: string;
	done: boolean;
}

export interface Node {
	entries: Record<string, Entry>;
	entryOrder: string[];
}

export interface Edge {
	from: string;
	to: string;
}

export interface Flow {
	name: string;
	nodes: Record<string, Node>;
	nodeOrder: string[];
	edges: Record<string, Edge>;
}

export interface Board {
	name: string;
	flowOrder: string[];
	flows: Record<string, Flow>;
}
