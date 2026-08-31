export type EntryType = 'skill' | 'boss' | 'item' | 'minigame';

export interface Entry {
	type: EntryType;
	label: string;
	done: boolean;
}

export interface Node {
	entries: Record<string, Entry>;
}

export interface Edge {
	from: string;
	to: string;
}

export interface Flow {
	name: string;
	nodes: Record<string, Node>;
	edges: Record<string, Edge>;
}

export interface Board {
	name: string;
	flowOrder: string[];
	flows: Record<string, Flow>;
}
