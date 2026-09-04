<script lang="ts">
	import { iconUrl } from '$lib/icon-url';

	interface SearchResult {
		type: string;
		name: string;
		wikiLink: string;
		icon: string | null;
		combatLevel?: number | null;
	}

	let { onselect, oncancel }: { onselect: (icon: string) => void; oncancel: () => void } = $props();

	let q = $state('');
	let results = $state<SearchResult[]>([]);
	let searching = $state(false);
	let searchToken = 0;
	let debounceTimer: ReturnType<typeof setTimeout>;

	async function runSearch(query: string) {
		const term = query.trim();
		if (!term) {
			results = [];
			return;
		}
		const token = ++searchToken;
		searching = true;
		try {
			const res = await fetch(`/api/search?q=${encodeURIComponent(term)}&limit=30`);
			const data = await res.json();
			if (token === searchToken) results = data.results ?? [];
		} catch {
			if (token === searchToken) results = [];
		} finally {
			if (token === searchToken) searching = false;
		}
	}

	function onSearchInput() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => runSearch(q), 150);
	}

	function pick(r: SearchResult) {
		if (!r.icon) return;
		onselect(r.icon);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') oncancel();
	}

	let searchInputEl = $state<HTMLInputElement>();
	$effect(() => {
		searchInputEl?.focus();
	});
</script>

<svelte:window onkeydown={onKeydown} />

<div class="backdrop" role="presentation" onclick={oncancel}>
	<div
		class="modal"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={(e) => e.stopPropagation()}
	>
		<button class="close" type="button" onclick={oncancel} aria-label="Close">&times;</button>
		<h2>Pick a favicon</h2>
		<input
			class="search-input"
			type="text"
			placeholder="Search skills, bosses, items…"
			bind:this={searchInputEl}
			bind:value={q}
			oninput={onSearchInput}
		/>
		<ul class="results">
			{#each results as r (r.type + '/' + r.wikiLink)}
				<li>
					<button type="button" onclick={() => pick(r)} disabled={!r.icon}>
						{#if r.icon}<img src={iconUrl(r.icon)} alt="" />{/if}
						<span class="name">{r.name}</span>
						<span class="badge">{r.type}</span>
					</button>
				</li>
			{/each}
			{#if q.trim() && !searching && results.length === 0}
				<li class="empty">No matches</li>
			{/if}
		</ul>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.modal {
		position: relative;
		background: var(--osrs-parchment);
		color: var(--osrs-text-dark);
		border: 2px solid var(--osrs-brown-dark);
		border-radius: 0;
		padding: 1.25rem;
		width: 22rem;
		max-width: calc(100vw - 2rem);
		max-height: calc(100vh - 4rem);
		overflow-y: auto;
	}

	.close {
		position: absolute;
		top: 0.4rem;
		right: 0.4rem;
		width: 1.5rem;
		height: 1.5rem;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1rem;
		line-height: 1;
	}

	h2 {
		margin: 0 0 0.75rem;
		font-size: 1.1rem;
		color: var(--osrs-brown);
	}

	.search-input {
		width: 100%;
		box-sizing: border-box;
		font-size: 1rem;
		padding: 0.3rem;
	}

	.results {
		list-style: none;
		margin: 0.5rem 0 0;
		padding: 0;
		max-height: 16rem;
		overflow-y: auto;
	}

	.results button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		text-align: left;
		padding: 0.3rem;
		background: none;
		border: none;
		cursor: pointer;
	}

	.results button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.results button:not(:disabled):hover {
		background: var(--osrs-parchment-dark);
	}

	.results img {
		width: 1.5rem;
		height: 1.5rem;
		object-fit: contain;
	}

	.results .name {
		flex: 1;
	}

	.results .badge {
		font-size: 0.7rem;
		text-transform: uppercase;
		color: var(--osrs-brown);
		border: 1px solid var(--osrs-brown-dark);
		border-radius: 0.2rem;
		padding: 0 0.2rem;
	}

	.results .empty {
		color: var(--osrs-brown);
		padding: 0.3rem;
	}
</style>
