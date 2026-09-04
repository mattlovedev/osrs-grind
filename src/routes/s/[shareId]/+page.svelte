<script lang="ts">
	import { iconUrl } from '$lib/icon-url';
	import { favicon } from '$lib/favicon.svelte';
	import defaultFavicon from '$lib/assets/favicon.png';
	import EntryContextMenu from '$lib/EntryContextMenu.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let board = $derived(data.board);

	$effect(() => {
		favicon.href = board.icon ? iconUrl(board.icon) : null;
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

<div class="title-row">
	<img class="board-icon" src={board.icon ? iconUrl(board.icon) : defaultFavicon} alt="" />
	<h1>{board.name || `Board ${board.shareId}`}</h1>
</div>

{#each board.flowOrder as flowId (flowId)}
	{@const flow = board.flows[flowId]}
	{@const nodeCount = (flow?.nodeOrder ?? Object.keys(flow?.nodes ?? {})).length}
	<div class="flow">
		{#if flow?.name}
			<span class="flow-name">{flow.name}</span>
		{/if}
		{#each flow?.nodeOrder ?? Object.keys(flow?.nodes ?? {}) as nodeId, i (nodeId)}
			{@const node = flow.nodes[nodeId]}
			<div class="node-unit">
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
				{#if i < nodeCount - 1}
					<span class="edge-arrow">&rarr;</span>
				{/if}
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
	.title-row {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.board-icon {
		flex-shrink: 0;
		width: 2.5rem;
		height: 2.5rem;
		object-fit: contain;
	}

	h1 {
		text-align: center;
		font-size: 3rem;
	}

	.flow {
		position: relative;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		row-gap: 1.25rem;
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

	.node-unit {
		display: flex;
		align-items: center;
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
		/* object-fit, not max-width/max-height - percentage max-height on a flex-child img overflows tall sprites on iOS Safari. */
		width: 85%;
		height: 85%;
		object-fit: contain;
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
