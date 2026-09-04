<script lang="ts">
	import { enhance } from '$app/forms';
	import { iconUrl } from '$lib/icon-url';
	import defaultFavicon from '$lib/assets/favicon.png';
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
					<a href="/s/{recent.shareId}">
						<img
							class="recent-icon"
							src={recent.icon ? iconUrl(recent.icon) : defaultFavicon}
							alt=""
						/>
						{recent.name || `Board ${recent.shareId}`}
					</a>
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

	h1 {
		padding-top: 2rem;
	}

	.recent-boards {
		max-width: 20rem;
		margin: 2rem auto 0;
		padding: 1rem 1.25rem;
		text-align: center;
		background: var(--osrs-parchment);
		border: 2px solid var(--osrs-brown-dark);
	}

	.recent-boards h2 {
		font-size: 1rem;
		color: var(--osrs-brown);
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

	.recent-boards a {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--osrs-brown);
	}

	.recent-boards a:hover {
		color: var(--osrs-brown-light);
	}

	.recent-icon {
		flex-shrink: 0;
		width: 1.25rem;
		height: 1.25rem;
		object-fit: contain;
	}

	.edited {
		color: var(--osrs-brown);
		font-size: 0.85rem;
		white-space: nowrap;
	}
</style>
