<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>OSRS Grinds</title>
</svelte:head>

<h1>OSRS Grind</h1>

<form method="POST" action="?/createBoard" use:enhance>
	<button type="submit">Create new board</button>
</form>

{#if data.recentBoards.length}
	<div class="recent-boards">
		<h2>Recent grinds</h2>
		<ul>
			{#each data.recentBoards as recent (recent.shareId)}
				<li><a href="/s/{recent.shareId}">{recent.name || `Board ${recent.shareId}`}</a></li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	h1,
	form {
		text-align: center;
	}

	.recent-boards {
		max-width: 20rem;
		margin: 2rem auto 0;
		text-align: center;
	}

	.recent-boards h2 {
		font-size: 1rem;
	}

	.recent-boards ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.recent-boards li {
		margin: 0.5rem 0;
	}
</style>
