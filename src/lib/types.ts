// Kept for the catalog / search endpoint - entries themselves no longer
// carry a type (creation is a single global search, not per-category).
export type EntryType = 'skill' | 'boss' | 'monster' | 'item' | 'minigame' | 'quest';

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
	// Read-only share link id (/s/[shareId]) - resolved server-side via the
	// shareLinks/{shareId} mapping, never the board's own id. Present on
	// every board (generated alongside boardId at creation), not just
	// boards someone chose to share - see DESIGN.md's read-only sharing
	// notes.
	shareId: string;
}
