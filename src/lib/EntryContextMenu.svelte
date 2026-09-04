<script lang="ts">
	let {
		label,
		wikiLink,
		x,
		y,
		onclose
	}: {
		label: string;
		wikiLink: string;
		x: number;
		y: number;
		onclose: () => void;
	} = $props();

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="backdrop" role="presentation" onclick={onclose} oncontextmenu={onclose}></div>

<div class="menu" style="left: {x}px; top: {y}px;">
	<div class="label">{label}</div>
	<a href={wikiLink} target="_blank" rel="noopener noreferrer" onclick={onclose}>Go to Wiki</a>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 100;
	}

	.menu {
		position: fixed;
		z-index: 101;
		background: #fff;
		border: 1px solid #999;
		border-radius: 0.25rem;
		padding: 0.5rem;
		min-width: 8rem;
	}

	.label {
		font-weight: 600;
		font-size: 0.85rem;
		margin-bottom: 0.4rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	a {
		display: block;
	}
</style>
