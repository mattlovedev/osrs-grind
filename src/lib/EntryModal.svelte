<script lang="ts">
	import { iconUrl } from '$lib/icon-url';

	interface EntryDraft {
		label: string;
		wikiLink: string;
		icon: string;
		bottomText: string;
	}

	interface SearchResult {
		type: string;
		name: string;
		wikiLink: string;
		icon: string | null;
		combatLevel?: number | null;
	}

	let {
		initial = null,
		onsubmit,
		oncancel
	}: {
		initial?: EntryDraft | null;
		onsubmit: (entry: EntryDraft) => void;
		oncancel: () => void;
	} = $props();

	// Snapshot the prop once - the form drafts are edited independently and
	// this component is remounted per open, so it never needs to react to
	// `initial` changing.
	// svelte-ignore state_referenced_locally
	const seed = initial;

	// 'search'      - pick a catalog entry (identity + icon), then -> form
	// 'form'        - edit name / caption, view icon, open icon search
	// 'icon-search' - pick a catalog entry for its icon only, then -> form
	let view = $state<'search' | 'form' | 'icon-search'>(seed ? 'form' : 'search');

	let label = $state(seed?.label ?? '');
	let wikiLink = $state(seed?.wikiLink ?? '');
	let icon = $state(seed?.icon ?? '');
	let bottomText = $state(seed?.bottomText ?? '');

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

	function resetSearch() {
		q = '';
		results = [];
	}

	function pick(r: SearchResult) {
		if (view === 'icon-search') {
			icon = r.icon ?? '';
		} else {
			label = r.name;
			wikiLink = r.wikiLink;
			icon = r.icon ?? '';
		}
		resetSearch();
		view = 'form';
	}

	function openIconSearch() {
		resetSearch();
		view = 'icon-search';
	}

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!label.trim()) return;
		onsubmit({ label: label.trim(), wikiLink, icon, bottomText: bottomText.trim() });
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') oncancel();
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#snippet searchView(heading: string, canGoBack: boolean)}
	<h2>{heading}</h2>
	<!-- svelte-ignore a11y_autofocus -->
	<input
		class="search-input"
		type="text"
		placeholder="Search skills, bosses, items…"
		bind:value={q}
		oninput={onSearchInput}
		autofocus
	/>
	<ul class="results">
		{#each results as r (r.type + '/' + r.wikiLink)}
			<li>
				<button type="button" onclick={() => pick(r)}>
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
	{#if canGoBack}
		<div class="actions">
			<button type="button" onclick={() => (view = 'form')}>Back</button>
		</div>
	{/if}
{/snippet}

<div class="backdrop" role="presentation" onclick={oncancel}>
	<div
		class="modal"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={(e) => e.stopPropagation()}
	>
		<button class="close" type="button" onclick={oncancel} aria-label="Close">&times;</button>

		{#if view === 'search'}
			{@render searchView('Add entry', false)}
		{:else if view === 'icon-search'}
			{@render searchView('Pick an icon', true)}
		{:else}
			<h2>{initial ? 'Edit entry' : 'New entry'}</h2>
			<form onsubmit={submit}>
				<label>
					Name
					<!-- svelte-ignore a11y_autofocus -->
					<input type="text" bind:value={label} autofocus />
				</label>
				<label>
					Wiki link
					<input type="text" value={wikiLink} readonly />
				</label>
				<div class="icon-field">
					<span>Icon</span>
					<button
						type="button"
						class="icon-pick"
						onclick={openIconSearch}
						title="Choose a different icon"
					>
						{#if icon}
							<img src={iconUrl(icon)} alt="" />
						{:else}
							<span class="icon-placeholder">?</span>
						{/if}
					</button>
				</div>
				<label>
					Caption
					<input type="text" bind:value={bottomText} placeholder="70, 1k, etc." />
				</label>
				<div class="actions">
					<button type="button" onclick={oncancel}>Cancel</button>
					<button type="submit">{initial ? 'Save' : 'Add'}</button>
				</div>
			</form>
		{/if}
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
		background: #fff;
		border: 1px solid #999;
		border-radius: 0.25rem;
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
		font-size: 1rem;
		line-height: 1;
	}

	h2 {
		margin: 0 0 0.75rem;
		font-size: 1.1rem;
	}

	.search-input,
	form label input {
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

	.results button:hover {
		background: #eee;
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
		color: #666;
		border: 1px solid #ccc;
		border-radius: 0.2rem;
		padding: 0 0.2rem;
	}

	.results .empty {
		color: #999;
		padding: 0.3rem;
	}

	form label {
		display: block;
		margin-bottom: 0.6rem;
		font-size: 0.85rem;
	}

	.icon-field {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.6rem;
		font-size: 0.85rem;
	}

	.icon-pick {
		width: 2.25rem;
		height: 2.25rem;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid #ccc;
		background: #fff;
		cursor: pointer;
	}

	.icon-pick img {
		max-width: 90%;
		max-height: 90%;
		object-fit: contain;
	}

	.icon-placeholder {
		font-size: 1.2rem;
		font-weight: bold;
		color: #999;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}
</style>
