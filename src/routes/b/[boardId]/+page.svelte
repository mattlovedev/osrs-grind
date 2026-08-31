<script lang="ts">
	import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
	import { db } from '$lib/firebase';
	import type { Board } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let board = $state<Board>({ name: '', flowOrder: [], flows: {} });
	let live = $state(false);
	let editingName = $state(false);
	let nameDraft = $state('');

	$effect(() => {
		board = data.board;
		live = false;
		const ref = doc(db, 'boards', data.boardId);
		const unsubscribe = onSnapshot(ref, (snap) => {
			const snapData = snap.data();
			if (snapData) {
				board = {
					name: snapData.name ?? '',
					flowOrder: snapData.flowOrder ?? [],
					flows: snapData.flows ?? {}
				};
				live = true;
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

	async function addTestFlow() {
		const ref = doc(db, 'boards', data.boardId);
		const flowId = crypto.randomUUID().slice(0, 8);
		await updateDoc(ref, {
			updatedAt: serverTimestamp(),
			flowOrder: [...board.flowOrder, flowId],
			[`flows.${flowId}`]: { name: `Test flow ${board.flowOrder.length + 1}`, nodes: {}, edges: {} }
		});
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

<p>Realtime listener connected: {live}</p>

<button onclick={addTestFlow}>Add test flow</button>

<pre>{JSON.stringify(board, null, 2)}</pre>
