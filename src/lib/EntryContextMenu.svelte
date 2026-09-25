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

	const EDGE_MARGIN_PX = 8;

	let menuEl = $state<HTMLDivElement>();
	let left = $state(0);
	let top = $state(0);

	// Open at the click/press point, but shift left/up as needed so the menu stays
	// fully on screen (a press near the right edge otherwise runs off it on mobile).
	$effect.pre(() => {
		left = x;
		top = y;
	});

	$effect(() => {
		if (!menuEl) return;
		const { width, height } = menuEl.getBoundingClientRect();
		const maxLeft = window.innerWidth - width - EDGE_MARGIN_PX;
		const maxTop = window.innerHeight - height - EDGE_MARGIN_PX;
		left = Math.max(EDGE_MARGIN_PX, Math.min(x, maxLeft));
		top = Math.max(EDGE_MARGIN_PX, Math.min(y, maxTop));
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="backdrop" role="presentation" onclick={onclose} oncontextmenu={onclose}></div>

<div class="menu" bind:this={menuEl} style="left: {left}px; top: {top}px;">
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
		background: var(--osrs-parchment);
		border: 2px solid var(--osrs-brown-dark);
		padding: 0.5rem;
		min-width: 8rem;
		/* Size to content rather than shrink-to-fit the space right of `left`, so the
		   width measured for edge clamping is the menu's real width. */
		width: max-content;
		max-width: calc(100vw - 16px);
	}

	.label {
		font-weight: 600;
		font-size: 0.85rem;
		color: var(--osrs-text-dark);
		margin-bottom: 0.4rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	a {
		display: block;
		color: var(--osrs-brown);
		font-weight: 700;
	}

	a:hover {
		color: var(--osrs-brown-light);
	}
</style>
