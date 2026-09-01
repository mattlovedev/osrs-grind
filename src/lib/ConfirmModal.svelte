<script lang="ts">
	let {
		title = 'Are you sure?',
		message,
		confirmLabel = 'Delete',
		onconfirm,
		oncancel
	}: {
		title?: string;
		message: string;
		confirmLabel?: string;
		onconfirm: () => void;
		oncancel: () => void;
	} = $props();

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') oncancel();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="backdrop" role="presentation" onclick={oncancel}>
	<div
		class="modal"
		role="alertdialog"
		aria-modal="true"
		tabindex="-1"
		onclick={(e) => e.stopPropagation()}
	>
		<button class="close" type="button" onclick={oncancel} aria-label="Close">&times;</button>
		<h2>{title}</h2>
		<p>{message}</p>
		<div class="actions">
			<button type="button" onclick={oncancel}>Cancel</button>
			<button type="button" class="danger" onclick={onconfirm}>{confirmLabel}</button>
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
		background: #fff;
		border: 1px solid #999;
		border-radius: 0.25rem;
		padding: 1.25rem;
		width: 22rem;
		max-width: calc(100vw - 2rem);
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
		margin: 0 0 0.5rem;
		font-size: 1.1rem;
	}

	p {
		margin: 0 0 1rem;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	.danger {
		color: #a11;
	}
</style>
