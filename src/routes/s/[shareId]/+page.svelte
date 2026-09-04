<script lang="ts">
	import { iconUrl } from '$lib/icon-url';
	import { favicon } from '$lib/favicon.svelte';
	import EntryContextMenu from '$lib/EntryContextMenu.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let board = $derived(data.board);

	// First entity of the first node of the first grind, for the favicon -
	// flowOrder/nodeOrder/entryOrder are explicit ordering arrays (not
	// object insertion order), so reading index 0 off each already accounts
	// for grinds/nodes/entries being reordered.
	let firstEntityIcon = $derived.by(() => {
		const flow = board.flows[(board.flowOrder ?? [])[0]];
		if (!flow) return null;
		const node = flow.nodes[(flow.nodeOrder ?? Object.keys(flow.nodes ?? {}))[0]];
		if (!node) return null;
		const entry = node.entries[(node.entryOrder ?? Object.keys(node.entries ?? {}))[0]];
		return entry?.icon ? iconUrl(entry.icon) : null;
	});

	$effect(() => {
		favicon.href = firstEntityIcon;
		return () => {
			favicon.href = null;
		};
	});

	type WikiMenuData = { label: string; wikiLink: string; x: number; y: number };
	let wikiMenu = $state<WikiMenuData | null>(null);

	function openWikiMenu(e: MouseEvent, label: string, wikiLink: string) {
		if (!wikiLink) return;
		e.preventDefault();
		wikiMenu = { label, wikiLink, x: e.clientX, y: e.clientY };
	}
</script>

<svelte:head>
	<title>{board.name || `Board ${board.shareId}`}</title>
</svelte:head>

<h1>{board.name || `Board ${board.shareId}`}</h1>

{#each board.flowOrder as flowId (flowId)}
	{@const flow = board.flows[flowId]}
	<div class="flow">
		{#if flow?.name}
			<span class="flow-name">{flow.name}</span>
		{/if}
		{#each flow?.nodeOrder ?? Object.keys(flow?.nodes ?? {}) as nodeId, i (nodeId)}
			{@const node = flow.nodes[nodeId]}
			{#if i > 0}
				<span class="edge-arrow">&rarr;</span>
			{/if}
			<div class="node">
				<div class="node-entries">
					{#each node.entryOrder ?? Object.keys(node.entries) as entryId (entryId)}
						{@const entry = node.entries[entryId]}
						<div
							class="entry-cell"
							class:done={entry.done}
							title={entry.label}
							oncontextmenu={(e) => openWikiMenu(e, entry.label, entry.wikiLink)}
						>
							{#if entry.icon}
								<img src={iconUrl(entry.icon)} alt={entry.label} />
							{:else}
								<span class="icon-placeholder">?</span>
							{/if}
							{#if entry.bottomText}
								<span class="level-badge">{entry.bottomText}</span>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/each}
	</div>
{/each}

{#if wikiMenu}
	<EntryContextMenu
		label={wikiMenu.label}
		wikiLink={wikiMenu.wikiLink}
		x={wikiMenu.x}
		y={wikiMenu.y}
		onclose={() => (wikiMenu = null)}
	/>
{/if}

<style>
	h1 {
		text-align: center;
		font-size: 3rem;
	}

	.flow {
		position: relative;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		justify-content: center;
		width: fit-content;
		margin: 2rem auto;
		padding: 0.75rem;
		background: var(--osrs-parchment);
		border: 2px solid var(--osrs-brown-dark);
	}

	.flow-name {
		flex-shrink: 0;
		max-width: 6rem;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--osrs-brown);
		text-align: right;
		overflow-wrap: break-word;
		margin-right: 0.75rem;
	}

	.edge-arrow {
		font-size: 1.5rem;
		margin: 0 0.5rem;
		color: var(--osrs-brown);
	}

	.node {
		display: flex;
		align-items: center;
	}

	.node-entries {
		display: grid;
		grid-template-rows: repeat(2, auto);
		grid-auto-flow: column;
	}

	.entry-cell {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		background: var(--osrs-parchment-light);
		border: 1px solid var(--osrs-brown-dark);
	}

	.entry-cell.done {
		background: var(--osrs-done);
	}

	.entry-cell img {
		max-width: 85%;
		max-height: 85%;
	}

	.icon-placeholder {
		font-size: 1.25rem;
		font-weight: bold;
		color: var(--osrs-brown);
	}

	.level-badge {
		position: absolute;
		bottom: 0.1rem;
		left: 0.1rem;
		font-size: 0.65rem;
		line-height: 1;
		padding: 0.05rem 0.2rem;
		background: rgba(0, 0, 0, 0.75);
		color: var(--osrs-parchment-light);
		border-radius: 0.2rem;
	}
</style>
