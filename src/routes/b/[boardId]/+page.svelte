<script lang="ts">
	import { doc, onSnapshot, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
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
	let showAddMenu = $state(false);

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

	async function createFirstEntry(type: EntryType) {
		const ref = doc(db, 'boards', data.boardId);
		const flowId = crypto.randomUUID().slice(0, 8);
		const nodeId = crypto.randomUUID().slice(0, 8);
		const entryId = crypto.randomUUID().slice(0, 8);
		await updateDoc(ref, {
			updatedAt: serverTimestamp(),
			flowOrder: [...board.flowOrder, flowId],
			[`flows.${flowId}`]: {
				name: '',
				nodes: { [nodeId]: { entries: { [entryId]: { type, label: '', done: false } } } },
				edges: {}
			}
		});
		showAddMenu = false;
	}
</script>

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

{#if board.flowOrder.length === 0}
	{#if showAddMenu}
		<div
			class="add-flow-menu"
			onfocusout={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node | null)) showAddMenu = false;
			}}
		>
			<button onclick={() => createFirstEntry('skill')} autofocus>
				<img src="https://oldschool.runescape.wiki/images/Stats_icon.png?1b467" alt="" />
				Skill
			</button>
			<button onclick={() => createFirstEntry('boss')}>
				<img src="https://oldschool.runescape.wiki/images/Combat_icon.png" alt="" />
				Kill
			</button>
		</div>
	{:else}
		<button class="add-flow-button" title="Add grind" onclick={() => (showAddMenu = true)}>+</button
		>
	{/if}
{:else}
	{#each board.flowOrder as flowId (flowId)}
		{#each Object.entries(board.flows[flowId]?.nodes ?? {}) as [nodeId, node] (nodeId)}
			{#each Object.entries(node.entries) as [entryId, entry] (entryId)}
				<div>{entry.type}: {entry.label || '(unnamed)'}</div>
			{/each}
		{/each}
	{/each}
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

	h1 input {
		font-size: inherit;
		font-family: inherit;
		text-align: center;
		width: 100%;
	}
</style>
