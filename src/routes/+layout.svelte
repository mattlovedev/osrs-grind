<script lang="ts">
	import '$lib/theme.css';
	import favicon from '$lib/assets/favicon.png';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} type="image/png" />
</svelte:head>

{@render children()}
