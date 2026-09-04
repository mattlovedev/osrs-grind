<script lang="ts">
	import '$lib/theme.css';
	import defaultFavicon from '$lib/assets/favicon.png';
	import { favicon } from '$lib/favicon.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon.href ?? defaultFavicon} />
</svelte:head>

{@render children()}
