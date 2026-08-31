<script lang="ts">
	import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
	import { db } from '$lib/firebase';
	import type { Board } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let board = $state<Board>({ flowOrder: [], flows: {} });
	let live = $state(false);

	$effect(() => {
		board = data.board;
		live = false;
		const ref = doc(db, 'boards', data.boardId);
		const unsubscribe = onSnapshot(ref, (snap) => {
			const snapData = snap.data();
			if (snapData) {
				board = { flowOrder: snapData.flowOrder ?? [], flows: snapData.flows ?? {} };
				live = true;
			}
		});
		return unsubscribe;
	});

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

<h1>Board {data.boardId}</h1>
<p>Realtime listener connected: {live}</p>

<button onclick={addTestFlow}>Add test flow</button>

<pre>{JSON.stringify(board, null, 2)}</pre>
