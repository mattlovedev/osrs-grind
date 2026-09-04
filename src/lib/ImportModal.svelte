<script lang="ts">
	let {
		onsubmit,
		oncancel
	}: {
		// returns an error message to show, or null once the import succeeded
		onsubmit: (text: string) => Promise<string | null>;
		oncancel: () => void;
	} = $props();

	let text = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);
	let textareaEl = $state<HTMLTextAreaElement | undefined>();

	$effect(() => {
		textareaEl?.focus();
	});

	async function submit() {
		if (busy) return;
		busy = true;
		error = await onsubmit(text);
		busy = false;
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') oncancel();
	}
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
		<h2>Import board</h2>
		<p>Paste exported board JSON.</p>
		<textarea bind:this={textareaEl} bind:value={text} rows="12" spellcheck="false"></textarea>
		{#if error}
			<p class="error">{error}</p>
		{/if}
		<div class="actions">
			<button type="button" onclick={oncancel}>Cancel</button>
			<button type="button" onclick={submit} disabled={busy || text.trim() === ''}>Import</button>
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
		border-radius: 0;
		padding: 1.25rem;
		width: 32rem;
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
		margin: 0 0 0.5rem;
		font-size: 1.1rem;
		color: var(--osrs-brown);
	}

	p {
		margin: 0 0 0.75rem;
	}

	textarea {
		width: 100%;
		box-sizing: border-box;
		font-family: monospace;
		font-size: 0.85rem;
		resize: vertical;
	}

	.error {
		margin: 0.5rem 0 0;
		color: var(--osrs-danger);
		font-size: 0.9rem;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 1rem;
	}
</style>
