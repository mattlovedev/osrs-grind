<script lang="ts">
	import { iconUrl } from '$lib/icon-url';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let board = $derived(data.board);
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
						<div class="entry-cell" class:done={entry.done} title={entry.label}>
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
	}

	.flow-name {
		flex-shrink: 0;
		max-width: 6rem;
		font-size: 0.9rem;
		font-weight: 600;
		text-align: right;
		overflow-wrap: break-word;
		margin-right: 0.75rem;
	}

	.edge-arrow {
		font-size: 1.5rem;
		margin: 0 0.5rem;
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
		border: 1px solid #999;
	}

	.entry-cell.done {
		background: #b9eab0;
	}

	.entry-cell img {
		max-width: 85%;
		max-height: 85%;
	}

	.icon-placeholder {
		font-size: 1.25rem;
		font-weight: bold;
		color: #999;
	}

	.level-badge {
		position: absolute;
		bottom: 0.1rem;
		left: 0.1rem;
		font-size: 0.65rem;
		line-height: 1;
		padding: 0.05rem 0.2rem;
		background: rgba(255, 255, 255, 0.85);
		border-radius: 0.2rem;
	}
</style>
