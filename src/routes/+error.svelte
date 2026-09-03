<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>OSRS Grinds</title>
</svelte:head>

<h1>{page.status}</h1>
<p>{page.error?.message}</p>
<a href={resolve('/')}>Back to home</a>

<style>
	h1,
	p,
	a {
		text-align: center;
		display: block;
	}
</style>
