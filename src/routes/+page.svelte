<script lang="ts">
	import { enhance } from '$app/forms';
</script>

<svelte:head>
	<title>OSRS Grinds</title>
</svelte:head>

<h1>OSRS Grind</h1>

<form method="POST" action="?/createBoard" use:enhance>
	<button type="submit">Create new board</button>
</form>

<style>
	h1,
	form {
		text-align: center;
	}
</style>
