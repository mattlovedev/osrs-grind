<script lang="ts">
	let { onclose }: { onclose: () => void } = $props();

	// This component only ever mounts client-side (inside an {#if}, never
	// during SSR), so location is safe to read directly here.
	const url = location.href;
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
		<h2>Everything is auto-saved</h2>
		<p>
			Every change you make on this board - toggling entries, adding nodes, renaming grinds - is
			saved automatically. There's nothing to remember to click.
		</p>
		<p>
			This page's link <strong>is</strong> your access to the board - it's how you get back to it,
			and it lets whoever holds it edit it. Don't share this link with anyone. Use the
			<strong>Share</strong> button instead for a read-only link that's safe to hand out.
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
		margin: 0 0 0.75rem;
	}

	p:last-child {
		margin-bottom: 0;
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
