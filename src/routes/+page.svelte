<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
	const units: [Intl.RelativeTimeFormatUnit, number][] = [
		['year', 60 * 60 * 24 * 365],
		['month', 60 * 60 * 24 * 30],
		['week', 60 * 60 * 24 * 7],
		['day', 60 * 60 * 24],
		['hour', 60 * 60],
		['minute', 60]
	];

	function timeAgo(ms: number): string {
		const diffSec = (ms - Date.now()) / 1000;
		for (const [unit, secInUnit] of units) {
			if (Math.abs(diffSec) >= secInUnit) return rtf.format(Math.round(diffSec / secInUnit), unit);
		}
		return rtf.format(Math.round(diffSec), 'second');
	}
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
		<h2>Recent Grinds</h2>
		<ul>
			{#each data.recentBoards as recent (recent.shareId)}
				<li>
					<a href="/s/{recent.shareId}">{recent.name || `Board ${recent.shareId}`}</a>
					{#if recent.updatedAt}
						<span class="edited">{timeAgo(recent.updatedAt)}</span>
					{/if}
				</li>
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
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin: 0.5rem 0;
	}

	.edited {
		color: #888;
		font-size: 0.85rem;
		white-space: nowrap;
	}
</style>
