<script lang="ts">
	import { doc, onSnapshot, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { db } from '$lib/firebase';
	import type { Board } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let board = $state<Board>({ name: '', flowOrder: [], flows: {} });
	let editingName = $state(false);
	let nameDraft = $state('');

	$effect(() => {
		board = data.board;
		const ref = doc(db, 'boards', data.boardId);
		const unsubscribe = onSnapshot(ref, (snap) => {
			const snapData = snap.data();
			if (snapData) {
				board = {
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

	async function deleteBoard() {
		if (!confirm('Delete this board? This cannot be undone.')) return;
		const ref = doc(db, 'boards', data.boardId);
		await deleteDoc(ref);
		goto(resolve('/'));
	}
</script>

{#if editingName}
	<form onsubmit={saveName}>
		<input bind:value={nameDraft} autofocus />
	</form>
{:else}
	<h1>
		<button type="button" onclick={startEditingName}>Board {board.name || data.boardId}</button>
	</h1>
{/if}

<button onclick={deleteBoard}>Delete board</button>
