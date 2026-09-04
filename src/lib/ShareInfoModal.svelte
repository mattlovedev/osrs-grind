<script lang="ts">
	let { shareId, onclose }: { shareId: string; onclose: () => void } = $props();

	// This component only ever mounts client-side (inside an {#if}, never
	// during SSR), so location is safe to read directly here. shareId never
	// changes for a mounted board page, so a snapshot is fine.
	// svelte-ignore state_referenced_locally
	const url = `${location.origin}/s/${shareId}`;
	let copied = $state(false);

	async function copyUrl() {
		await navigator.clipboard.writeText(url);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="backdrop" role="presentation" onclick={onclose}>
	<div
		class="modal"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={(e) => e.stopPropagation()}
	>
		<button class="close" type="button" onclick={onclose} aria-label="Close">&times;</button>
		<h2>Read-only share link</h2>
		<p>
			Anyone with this link can view this board's progress, but can't edit anything - safe to
			share with others.
		</p>
		<div class="url-row">
			<code>{url}</code>
			<button type="button" onclick={copyUrl}>{copied ? 'Copied!' : 'Copy'}</button>
		</div>
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
		padding: 1.25rem;
		width: 24rem;
		max-width: calc(100vw - 2rem);
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

	p {
		margin: 0;
	}

	.url-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.url-row code {
		flex: 1;
		min-width: 0;
		overflow-x: auto;
		white-space: nowrap;
		background: var(--osrs-parchment-light);
		border: 1px solid var(--osrs-brown-dark);
		padding: 0.3rem 0.4rem;
		font-size: 0.8rem;
	}

	.url-row button {
		flex-shrink: 0;
	}
</style>
