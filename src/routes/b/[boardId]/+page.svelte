<script lang="ts">
	import {
		doc,
		onSnapshot,
		updateDoc,
		deleteDoc,
		deleteField,
		serverTimestamp,
		arrayUnion,
		arrayRemove
	} from 'firebase/firestore';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { db } from '$lib/firebase';
	import { iconUrl } from '$lib/icon-url';
	import type { Board } from '$lib/types';
	import type { PageData } from './$types';
	import EntryModal from '$lib/EntryModal.svelte';
	import ConfirmModal from '$lib/ConfirmModal.svelte';

	type EntryDraft = { label: string; wikiLink: string; icon: string; bottomText: string };

	let { data }: { data: PageData } = $props();

	let liveBoard = $state<Board | null>(null);
	let board = $derived(liveBoard ?? data.board);
	let editingName = $state(false);
	let nameDraft = $state('');

	type AddTarget = { flowId: string; nodeId: string; mode: 'append' | 'edge' } | null;
	type EditTarget = { flowId: string; nodeId: string; entryId: string } | null;
	let addTarget = $state<AddTarget>(null);
	let editTarget = $state<EditTarget>(null);
	let modalOpen = $state(false);
	let editMode = $state(false);

	let editInitial = $derived.by(() => {
		if (!editTarget) return null;
		const e = board.flows[editTarget.flowId]?.nodes[editTarget.nodeId]?.entries[editTarget.entryId];
		if (!e) return null;
		return {
			label: e.label ?? '',
			wikiLink: e.wikiLink ?? '',
			icon: e.icon ?? '',
			bottomText: e.bottomText ?? ''
		};
	});

	function openAdd(target: AddTarget) {
		addTarget = target;
		editTarget = null;
		modalOpen = true;
	}

	function openEdit(flowId: string, nodeId: string, entryId: string) {
		editTarget = { flowId, nodeId, entryId };
		addTarget = null;
		modalOpen = true;
	}

	function closeModal() {
		modalOpen = false;
		addTarget = null;
		editTarget = null;
	}

	function toggleEditMode() {
		editMode = !editMode;
		if (!editMode) {
			closeModal();
			editingName = false;
		}
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
		nameDraft = board.name || `Board ${data.boardId}`;
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

	type ConfirmData = {
		title: string;
		message: string;
		perform: () => Promise<void> | void;
	};
	let confirmData = $state<ConfirmData | null>(null);

	function cancelConfirm() {
		confirmData = null;
	}

	async function runConfirm() {
		const perform = confirmData?.perform;
		confirmData = null;
		await perform?.();
	}

	async function doDeleteBoard() {
		const ref = doc(db, 'boards', data.boardId);
		await deleteDoc(ref);
		goto(resolve('/'));
	}

	async function doDeleteFlow(flowId: string) {
		const ref = doc(db, 'boards', data.boardId);
		await updateDoc(ref, {
			updatedAt: serverTimestamp(),
			flowOrder: arrayRemove(flowId),
			[`flows.${flowId}`]: deleteField()
		});
	}

	async function moveFlow(flowId: string, direction: -1 | 1) {
		const order = board.flowOrder;
		const index = order.indexOf(flowId);
		const newIndex = index + direction;
		if (index === -1 || newIndex < 0 || newIndex >= order.length) return;
		const newOrder = [...order];
		[newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]];
		const ref = doc(db, 'boards', data.boardId);
		await updateDoc(ref, {
			updatedAt: serverTimestamp(),
			flowOrder: newOrder
		});
	}

	async function doDeleteNode(flowId: string, nodeId: string) {
		const ref = doc(db, 'boards', data.boardId);
		const edges = board.flows[flowId]?.edges ?? {};
		const orphanedEdgeIds = Object.entries(edges)
			.filter(([, edge]) => edge.from === nodeId || edge.to === nodeId)
			.map(([edgeId]) => edgeId);
		const updates: Record<string, unknown> = {
			updatedAt: serverTimestamp(),
			[`flows.${flowId}.nodeOrder`]: arrayRemove(nodeId),
			[`flows.${flowId}.nodes.${nodeId}`]: deleteField()
		};
		for (const edgeId of orphanedEdgeIds) {
			updates[`flows.${flowId}.edges.${edgeId}`] = deleteField();
		}
		await updateDoc(ref, updates);
	}

	function askDeleteBoard() {
		confirmData = {
			title: 'Delete board',
			message: 'This board and everything on it will be gone. This cannot be undone.',
			perform: doDeleteBoard
		};
	}

	function askDeleteFlow(flowId: string) {
		confirmData = {
			title: 'Delete grind',
			message: 'This grind and all its nodes will be gone. This cannot be undone.',
			perform: () => doDeleteFlow(flowId)
		};
	}

	// Only called for the node-delete button, which itself only renders
	// when the flow has more than one node (see nodeCount in the template) -
	// a flow's only node is deleted via "Delete grind" instead, since
	// they're the same operation.
	function askDeleteNode(flowId: string, nodeId: string) {
		confirmData = {
			title: 'Delete node',
			message: 'This node and everything in it will be gone. This cannot be undone.',
			perform: () => doDeleteNode(flowId, nodeId)
		};
	}

	async function doDeleteEntry(flowId: string, nodeId: string, entryId: string) {
		const ref = doc(db, 'boards', data.boardId);
		await updateDoc(ref, {
			updatedAt: serverTimestamp(),
			[`flows.${flowId}.nodes.${nodeId}.entryOrder`]: arrayRemove(entryId),
			[`flows.${flowId}.nodes.${nodeId}.entries.${entryId}`]: deleteField()
		});
	}

	// Only called for the entry-delete button, which itself only renders
	// when the node has more than one entry (see entryCount in the
	// template) - a node's only entry is deleted via "Delete node" instead,
	// since they're the same operation.
	function askDeleteEntry(flowId: string, nodeId: string, entryId: string) {
		confirmData = {
			title: 'Delete entry',
			message: 'This entry will be gone. This cannot be undone.',
			perform: () => doDeleteEntry(flowId, nodeId, entryId)
		};
	}

	async function toggleDone(flowId: string, nodeId: string, entryId: string, done: boolean) {
		if (editMode) return;
		const ref = doc(db, 'boards', data.boardId);
		await updateDoc(ref, {
			updatedAt: serverTimestamp(),
			[`flows.${flowId}.nodes.${nodeId}.entries.${entryId}.done`]: !done
		});
	}

	async function createEntry(draft: EntryDraft) {
		const ref = doc(db, 'boards', data.boardId);
		const entryId = crypto.randomUUID().slice(0, 8);
		const entry = { ...draft, done: false };

		if (addTarget?.mode === 'append') {
			const { flowId, nodeId } = addTarget;
			await updateDoc(ref, {
				updatedAt: serverTimestamp(),
				[`flows.${flowId}.nodes.${nodeId}.entries.${entryId}`]: entry,
				[`flows.${flowId}.nodes.${nodeId}.entryOrder`]: arrayUnion(entryId)
			});
		} else if (addTarget?.mode === 'edge') {
			const { flowId, nodeId: fromNodeId } = addTarget;
			const newNodeId = crypto.randomUUID().slice(0, 8);
			const edgeId = crypto.randomUUID().slice(0, 8);
			await updateDoc(ref, {
				updatedAt: serverTimestamp(),
				[`flows.${flowId}.nodes.${newNodeId}`]: {
					entries: { [entryId]: entry },
					entryOrder: [entryId]
				},
				[`flows.${flowId}.nodeOrder`]: arrayUnion(newNodeId),
				[`flows.${flowId}.edges.${edgeId}`]: { from: fromNodeId, to: newNodeId }
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
							entries: { [entryId]: entry },
							entryOrder: [entryId]
						}
					},
					nodeOrder: [nodeId],
					edges: {}
				}
			});
		}
		closeModal();
	}

	async function updateEntry(target: NonNullable<EditTarget>, draft: EntryDraft) {
		const { flowId, nodeId, entryId } = target;
		const base = `flows.${flowId}.nodes.${nodeId}.entries.${entryId}`;
		const ref = doc(db, 'boards', data.boardId);
		await updateDoc(ref, {
			updatedAt: serverTimestamp(),
			[`${base}.label`]: draft.label,
			[`${base}.wikiLink`]: draft.wikiLink,
			[`${base}.icon`]: draft.icon,
			[`${base}.bottomText`]: draft.bottomText
		});
		closeModal();
	}

	function handleModalSubmit(draft: EntryDraft) {
		if (editTarget) updateEntry(editTarget, draft);
		else createEntry(draft);
	}
</script>

{#if modalOpen}
	<EntryModal initial={editInitial} onsubmit={handleModalSubmit} oncancel={closeModal} />
{/if}

{#if confirmData}
	<ConfirmModal
		title={confirmData.title}
		message={confirmData.message}
		onconfirm={runConfirm}
		oncancel={cancelConfirm}
	/>
{/if}

<h1>
	{#if editingName}
		<form onsubmit={saveName} style="display: contents;">
			<input
				bind:value={nameDraft}
				onblur={cancelEditingName}
				onkeydown={(e) => {
					if (e.key === 'Escape') cancelEditingName();
				}}
				onfocus={(e) => e.currentTarget.select()}
				autofocus
			/>
		</form>
	{:else if editMode}
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
	{:else}
		{board.name || `Board ${data.boardId}`}
	{/if}
</h1>

<div class="top-right-actions">
	<button class="edit-board" onclick={toggleEditMode}
		>{editMode ? 'Exit edit' : 'Edit board'}</button
	>
	{#if editMode}
		<button class="delete-board" onclick={askDeleteBoard}>Delete board</button>
	{/if}
</div>

{#each board.flowOrder as flowId, flowIndex (flowId)}
	{@const flow = board.flows[flowId]}
	{@const nodeCount = (flow?.nodeOrder ?? Object.keys(flow?.nodes ?? {})).length}
	<div class="flow" class:editing={editMode}>
		<div class="flow-controls">
			{#if flowIndex > 0}
				<button
					class="flow-move-button"
					title="Move up"
					onclick={() => moveFlow(flowId, -1)}
				>
					&uarr;
				</button>
			{/if}
			<button class="flow-delete-button" title="Delete grind" onclick={() => askDeleteFlow(flowId)}>
				&times;
			</button>
			{#if flowIndex < board.flowOrder.length - 1}
				<button
					class="flow-move-button"
					title="Move down"
					onclick={() => moveFlow(flowId, 1)}
				>
					&darr;
				</button>
			{/if}
		</div>
		{#each flow?.nodeOrder ?? Object.keys(flow?.nodes ?? {}) as nodeId, i (nodeId)}
			{@const node = flow.nodes[nodeId]}
			{@const isTailNode = !Object.values(flow.edges ?? {}).some((e) => e.from === nodeId)}
			{@const entryCount = (node.entryOrder ?? Object.keys(node.entries)).length}
			{#if i > 0}
				<span class="edge-arrow">&rarr;</span>
			{/if}
			<div class="node" class:editing={editMode}>
				<div class="node-entries">
					{#each node.entryOrder ?? Object.keys(node.entries) as entryId (entryId)}
						{@const entry = node.entries[entryId]}
						<div
							class="entry-cell"
							class:editing={editMode}
							class:done={entry.done}
							title={editMode ? undefined : entry.label}
							role="button"
							tabindex="0"
							onclick={() =>
								editMode
									? openEdit(flowId, nodeId, entryId)
									: toggleDone(flowId, nodeId, entryId, entry.done)}
							onkeydown={(e) => {
								if (e.key !== 'Enter' && e.key !== ' ') return;
								if (editMode) openEdit(flowId, nodeId, entryId);
								else toggleDone(flowId, nodeId, entryId, entry.done);
							}}
						>
							{#if entry.icon}
								<img src={iconUrl(entry.icon)} alt={entry.label} />
							{:else}
								<span class="icon-placeholder">?</span>
							{/if}
							{#if entry.bottomText}
								<span class="level-badge">{entry.bottomText}</span>
							{/if}
							{#if entryCount > 1}
								<button
									class="entry-delete-button"
									title="Delete entry"
									onclick={(e) => {
										e.stopPropagation();
										askDeleteEntry(flowId, nodeId, entryId);
									}}
								>
									&times;
								</button>
							{/if}
						</div>
					{/each}
				</div>
				<button
					class="node-add-button"
					title="Add to this node"
					onclick={() => openAdd({ flowId, nodeId, mode: 'append' })}
				>
					+
				</button>
				{#if isTailNode}
					<button
						class="node-edge-button"
						title="Add connected grind"
						onclick={() => openAdd({ flowId, nodeId, mode: 'edge' })}
					>
						&rarr;
					</button>
				{/if}
				{#if nodeCount > 1}
					<button
						class="node-delete-button"
						title="Delete node"
						onclick={() => askDeleteNode(flowId, nodeId)}
					>
						&times;
					</button>
				{/if}
			</div>
		{/each}
	</div>
{/each}

{#if editMode}
	<button class="add-flow-button" title="Add grind" onclick={() => openAdd(null)}>+</button>
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

	.top-right-actions {
		position: fixed;
		top: 1rem;
		right: 1rem;
		display: flex;
		gap: 0.5rem;
	}

	.add-flow-button {
		display: block;
		margin: 2rem auto;
		width: 6rem;
		height: 6rem;
		font-size: 3rem;
		line-height: 1;
	}

	h1 input {
		font-size: inherit;
		font-family: inherit;
		text-align: center;
		width: 100%;
	}

	.flow {
		position: relative;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		justify-content: center;
		width: fit-content;
		margin: 2rem auto;
	}

	.flow.editing {
		padding: 0.75rem;
		border: 1px solid #999;
	}

	.flow-controls {
		position: absolute;
		top: 50%;
		left: -1rem;
		transform: translateY(-50%);
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		opacity: 0;
		pointer-events: none;
	}

	.flow.editing:hover .flow-controls,
	.flow.editing:focus-within .flow-controls {
		opacity: 1;
		pointer-events: auto;
	}

	.flow-delete-button,
	.flow-move-button {
		width: 2rem;
		height: 2rem;
		font-size: 1.25rem;
	}

	.edge-arrow {
		font-size: 1.5rem;
		margin: 0 0.5rem;
	}

	.node {
		position: relative;
		display: flex;
		align-items: center;
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

	.entry-cell:not(.editing) {
		cursor: pointer;
	}

	.entry-cell.done {
		background: #b9eab0;
	}

	.entry-cell img {
		max-width: 85%;
		max-height: 85%;
	}

	.icon-placeholder {
		font-size: 1.25rem;
		font-weight: bold;
		color: #999;
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

	.entry-delete-button {
		position: absolute;
		top: -0.5rem;
		right: -0.5rem;
		z-index: 1;
		width: 1.25rem;
		height: 1.25rem;
		font-size: 0.85rem;
		line-height: 1;
		opacity: 0;
		pointer-events: none;
	}

	.entry-cell.editing:hover .entry-delete-button,
	.entry-cell.editing:focus-within .entry-delete-button {
		opacity: 1;
		pointer-events: auto;
	}

	.node-add-button,
	.node-edge-button,
	.node-delete-button {
		position: absolute;
		z-index: 1;
		opacity: 0;
		pointer-events: none;
	}

	.node-add-button,
	.node-edge-button {
		top: 0;
		width: 2.75rem;
		height: 2.75rem;
		font-size: 1.5rem;
	}

	.node-add-button {
		left: 100%;
	}

	.node-edge-button {
		left: calc(100% + 2.75rem);
	}

	.node-delete-button {
		top: -0.75rem;
		left: -0.75rem;
		width: 1.5rem;
		height: 1.5rem;
		font-size: 1rem;
	}

	.node.editing:hover .node-add-button,
	.node.editing:hover .node-edge-button,
	.node.editing:hover .node-delete-button,
	.node.editing:focus-within .node-add-button,
	.node.editing:focus-within .node-edge-button,
	.node.editing:focus-within .node-delete-button {
		opacity: 1;
		pointer-events: auto;
	}
</style>
