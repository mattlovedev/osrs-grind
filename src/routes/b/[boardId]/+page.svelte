<script lang="ts">
	import {
		doc,
		onSnapshot,
		updateDoc,
		deleteDoc,
		serverTimestamp,
		arrayUnion
	} from 'firebase/firestore';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { db } from '$lib/firebase';
	import type { Board, EntryType } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let liveBoard = $state<Board | null>(null);
	let board = $derived(liveBoard ?? data.board);
	let editingName = $state(false);
	let nameDraft = $state('');

	type AddTarget = { flowId: string; nodeId: string } | null;
	let addTarget = $state<AddTarget>(null);
	let addOpen = $state(false);
	let showSkillMenu = $state(false);

	const SKILLS = [
		'Attack',
		'Strength',
		'Defence',
		'Ranged',
		'Prayer',
		'Magic',
		'Runecraft',
		'Construction',
		'Hitpoints',
		'Agility',
		'Herblore',
		'Thieving',
		'Crafting',
		'Fletching',
		'Slayer',
		'Hunter',
		'Mining',
		'Smithing',
		'Fishing',
		'Cooking',
		'Firemaking',
		'Woodcutting',
		'Farming'
	];

	function skillIconUrl(skill: string) {
		return `https://oldschool.runescape.wiki/images/${skill}_icon.png`;
	}

	function openAddMenu(target: AddTarget) {
		addTarget = target;
		addOpen = true;
		showSkillMenu = false;
	}

	function closeAddFlow() {
		addOpen = false;
		showSkillMenu = false;
		addTarget = null;
	}

	$effect(() => {
		liveBoard = null;
		const ref = doc(db, 'boards', data.boardId);
		const unsubscribe = onSnapshot(ref, (snap) => {
			const snapData = snap.data();
			if (snapData) {
				liveBoard = {
					name: snapData.name ?? '',
					flowOrder: snapData.flowOrder ?? [],
					flows: snapData.flows ?? {}
				};
			}
		});
		return unsubscribe;
	});

	function startEditingName() {
		nameDraft = board.name;
		editingName = true;
	}

	async function saveName(e: SubmitEvent) {
		e.preventDefault();
		const ref = doc(db, 'boards', data.boardId);
		await updateDoc(ref, { updatedAt: serverTimestamp(), name: nameDraft });
		editingName = false;
	}

	function cancelEditingName() {
		editingName = false;
	}

	async function deleteBoard() {
		if (!confirm('Delete this board? This cannot be undone.')) return;
		const ref = doc(db, 'boards', data.boardId);
		await deleteDoc(ref);
		goto(resolve('/'));
	}

	async function createGrind(type: EntryType, label: string, icon: string) {
		const ref = doc(db, 'boards', data.boardId);
		const entryId = crypto.randomUUID().slice(0, 8);
		if (addTarget) {
			const { flowId, nodeId } = addTarget;
			await updateDoc(ref, {
				updatedAt: serverTimestamp(),
				[`flows.${flowId}.nodes.${nodeId}.entries.${entryId}`]: {
					type,
					label,
					icon,
					done: false
				},
				[`flows.${flowId}.nodes.${nodeId}.entryOrder`]: arrayUnion(entryId)
			});
		} else {
			const flowId = crypto.randomUUID().slice(0, 8);
			const nodeId = crypto.randomUUID().slice(0, 8);
			await updateDoc(ref, {
				updatedAt: serverTimestamp(),
				flowOrder: [...board.flowOrder, flowId],
				[`flows.${flowId}`]: {
					name: '',
					nodes: {
						[nodeId]: {
							entries: { [entryId]: { type, label, icon, done: false } },
							entryOrder: [entryId]
						}
					},
					edges: {}
				}
			});
		}
		closeAddFlow();
	}

	function levelFromLabel(label: string): string | null {
		return label.match(/^\d+/)?.[0] ?? null;
	}
</script>

{#snippet addMenu()}
	<div
		class="add-flow-container"
		onfocusout={(e) => {
			const container = e.currentTarget;
			setTimeout(() => {
				if (!container.contains(document.activeElement)) closeAddFlow();
			}, 0);
		}}
	>
		{#if showSkillMenu}
			<div class="skill-menu">
				{#each SKILLS as skill, i (skill)}
					<button
						onclick={() => {
							const level = prompt(`Target level for ${skill}?`);
							if (!level) return;
							createGrind('skill', `${level} ${skill}`, skillIconUrl(skill));
						}}
						onkeydown={(e) => {
							if (e.key === 'Escape') closeAddFlow();
						}}
						autofocus={i === 0}
					>
						<img src={skillIconUrl(skill)} alt="" />
						{skill}
					</button>
				{/each}
			</div>
		{:else}
			<div class="add-flow-menu">
				<button
					onclick={() => (showSkillMenu = true)}
					onkeydown={(e) => {
						if (e.key === 'Escape') closeAddFlow();
					}}
					autofocus
				>
					<img src="https://oldschool.runescape.wiki/images/Stats_icon.png?1b467" alt="" />
					Skill
				</button>
				<button
					onclick={() =>
						createGrind('boss', '', 'https://oldschool.runescape.wiki/images/Combat_icon.png')}
					onkeydown={(e) => {
						if (e.key === 'Escape') closeAddFlow();
					}}
				>
					<img src="https://oldschool.runescape.wiki/images/Combat_icon.png" alt="" />
					Kill
				</button>
			</div>
		{/if}
	</div>
{/snippet}

<h1>
	{#if editingName}
		<form onsubmit={saveName} style="display: contents;">
			<input
				bind:value={nameDraft}
				onblur={cancelEditingName}
				onkeydown={(e) => {
					if (e.key === 'Escape') cancelEditingName();
				}}
				autofocus
			/>
		</form>
	{:else}
		<span
			role="button"
			tabindex="0"
			onclick={startEditingName}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') startEditingName();
			}}
		>
			{board.name || `Board ${data.boardId}`}
		</span>
	{/if}
</h1>

<button class="delete-board" onclick={deleteBoard}>Delete board</button>

{#each board.flowOrder as flowId (flowId)}
	{#each Object.entries(board.flows[flowId]?.nodes ?? {}) as [nodeId, node] (nodeId)}
		<div class="node">
			<div class="node-entries">
				{#each node.entryOrder ?? Object.keys(node.entries) as entryId (entryId)}
					{@const entry = node.entries[entryId]}
					<div class="entry-cell">
						{#if entry.icon}
							<img src={entry.icon} alt={entry.label} />
						{/if}
						{#if levelFromLabel(entry.label)}
							<span class="level-badge">{levelFromLabel(entry.label)}</span>
						{/if}
					</div>
				{/each}
			</div>
			{#if addOpen && addTarget?.flowId === flowId && addTarget?.nodeId === nodeId}
				{@render addMenu()}
			{:else}
				<button
					class="node-add-button"
					title="Add to this node"
					onclick={() => openAddMenu({ flowId, nodeId })}
				>
					+
				</button>
			{/if}
		</div>
	{/each}
{/each}

{#if addOpen && addTarget === null}
	{@render addMenu()}
{:else if addTarget === null}
	<button class="add-flow-button" title="Add grind" onclick={() => openAddMenu(null)}>+</button>
{/if}

<style>
	h1 {
		text-align: center;
		font-size: 3rem;
	}

	h1 span {
		cursor: pointer;
	}

	h1 span:hover {
		text-decoration: underline;
	}

	.delete-board {
		position: fixed;
		top: 1rem;
		right: 1rem;
	}

	.add-flow-button {
		display: block;
		margin: 2rem auto;
		width: 6rem;
		height: 6rem;
		font-size: 3rem;
		line-height: 1;
	}

	.add-flow-menu {
		display: flex;
		flex-direction: column;
		margin: 2rem auto;
		width: 6rem;
		height: 6rem;
	}

	.add-flow-menu button {
		flex: 1;
		font-size: 1.5rem;
	}

	.add-flow-menu img {
		height: 1.5rem;
		width: auto;
		vertical-align: middle;
	}

	.skill-menu {
		display: flex;
		flex-direction: column;
		margin: 2rem auto;
		width: 16rem;
		max-height: 20rem;
		overflow-y: auto;
	}

	.skill-menu button {
		font-size: 1.5rem;
		text-align: left;
		white-space: nowrap;
	}

	.skill-menu img {
		height: 1.5rem;
		width: auto;
		vertical-align: middle;
	}

	h1 input {
		font-size: inherit;
		font-family: inherit;
		text-align: center;
		width: 100%;
	}

	.node {
		display: flex;
		align-items: center;
		width: fit-content;
		margin: 2rem auto;
	}

	.node-entries {
		display: grid;
		grid-template-rows: repeat(2, auto);
		grid-auto-flow: column;
	}

	.entry-cell {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		border: 1px solid #999;
	}

	.entry-cell img {
		max-width: 85%;
		max-height: 85%;
	}

	.level-badge {
		position: absolute;
		bottom: 0.1rem;
		left: 0.1rem;
		font-size: 0.65rem;
		line-height: 1;
		padding: 0.05rem 0.2rem;
		background: rgba(255, 255, 255, 0.85);
		border-radius: 0.2rem;
	}

	.node-add-button {
		width: 2.75rem;
		height: 2.75rem;
		font-size: 1.5rem;
		opacity: 0;
	}

	.node:hover .node-add-button,
	.node:focus-within .node-add-button {
		opacity: 1;
	}
</style>
