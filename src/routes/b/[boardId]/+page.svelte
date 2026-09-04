<script lang="ts">
	import {
		doc,
		onSnapshot,
		updateDoc,
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
	import ImportModal from '$lib/ImportModal.svelte';
	import EntryContextMenu from '$lib/EntryContextMenu.svelte';

	type EntryDraft = { label: string; wikiLink: string; icon: string; bottomText: string };

	let { data }: { data: PageData } = $props();

	let liveBoard = $state<Board | null>(null);
	let board = $derived(liveBoard ?? data.board);
	let isBlank = $derived((board.flowOrder ?? []).length === 0);
	let editingName = $state(false);
	let nameDraft = $state('');
	let editingFlowNameId = $state<string | null>(null);
	let flowNameDraft = $state('');

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
			importModalOpen = false;
			editingName = false;
			editingFlowNameId = null;
		}
	}

	let shareLinkCopied = $state(false);

	async function copyShareLink() {
		const url = `${location.origin}/s/${board.shareId}`;
		await navigator.clipboard.writeText(url);
		shareLinkCopied = true;
		setTimeout(() => (shareLinkCopied = false), 1500);
	}

	// Plain-data snapshot of the board: ordered arrays instead of the
	// id-keyed maps, no ids at all. Edges keep the structure as
	// from/to node indices into the flow's nodes array.
	function buildExport() {
		const grinds = (board.flowOrder ?? [])
			.map((flowId) => {
				const flow = board.flows[flowId];
				if (!flow) return null;
				const nodeIds = flow.nodeOrder ?? Object.keys(flow.nodes ?? {});
				const nodeIndex = new Map(nodeIds.map((id, i) => [id, i]));
				return {
					name: flow.name ?? '',
					nodes: nodeIds.map((nodeId) => {
						const node = flow.nodes[nodeId];
						const entryIds = node.entryOrder ?? Object.keys(node.entries ?? {});
						return {
							entries: entryIds.map((entryId) => {
								const e = node.entries[entryId];
								return {
									label: e.label ?? '',
									wikiLink: e.wikiLink ?? '',
									icon: e.icon ?? '',
									bottomText: e.bottomText ?? '',
									done: e.done ?? false
								};
							})
						};
					}),
					edges: Object.values(flow.edges ?? {})
						.map((edge) => ({ from: nodeIndex.get(edge.from), to: nodeIndex.get(edge.to) }))
						.filter((edge) => edge.from !== undefined && edge.to !== undefined)
				};
			})
			.filter((g) => g !== null);
		return { name: board.name ?? '', grinds };
	}

	let exportCopied = $state(false);

	async function copyExport() {
		await navigator.clipboard.writeText(JSON.stringify(buildExport(), null, 2));
		exportCopied = true;
		setTimeout(() => (exportCopied = false), 1500);
	}

	// Inverse of buildExport: take the plain-data JSON pasted into the import
	// modal and write it onto this (blank) board, minting fresh ids for every
	// flow, node and entry. Edges come in as from/to node indices. Returns an
	// error message to show in the modal, or null once the write succeeded.
	let importModalOpen = $state(false);
	let importDone = $state(false);

	async function importBoard(text: string): Promise<string | null> {
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch {
			return 'That is not valid JSON.';
		}
		if (
			typeof parsed !== 'object' ||
			parsed === null ||
			!Array.isArray((parsed as { grinds?: unknown }).grinds)
		) {
			return 'Expected an exported board: an object with a "grinds" array.';
		}
		const source = parsed as { name?: unknown; grinds: unknown[] };

		const id = () => crypto.randomUUID().slice(0, 8);
		const flows: Record<string, unknown> = {};
		const flowOrder: string[] = [];

		for (const rawGrind of source.grinds) {
			const grind = (rawGrind ?? {}) as {
				name?: unknown;
				nodes?: unknown[];
				edges?: unknown[];
			};
			const flowId = id();
			flowOrder.push(flowId);

			const nodeIds: string[] = [];
			const nodes: Record<string, unknown> = {};
			const nodeOrder: string[] = [];
			for (const rawNode of Array.isArray(grind.nodes) ? grind.nodes : []) {
				const node = (rawNode ?? {}) as { entries?: unknown[] };
				const nodeId = id();
				nodeIds.push(nodeId);
				nodeOrder.push(nodeId);
				const entries: Record<string, unknown> = {};
				const entryOrder: string[] = [];
				for (const rawEntry of Array.isArray(node.entries) ? node.entries : []) {
					const e = (rawEntry ?? {}) as Record<string, unknown>;
					const entryId = id();
					entryOrder.push(entryId);
					entries[entryId] = {
						label: typeof e.label === 'string' ? e.label : '',
						wikiLink: typeof e.wikiLink === 'string' ? e.wikiLink : '',
						icon: typeof e.icon === 'string' ? e.icon : '',
						bottomText: typeof e.bottomText === 'string' ? e.bottomText : '',
						done: e.done === true
					};
				}
				nodes[nodeId] = { entries, entryOrder };
			}

			const edges: Record<string, unknown> = {};
			for (const rawEdge of Array.isArray(grind.edges) ? grind.edges : []) {
				const edge = (rawEdge ?? {}) as { from?: unknown; to?: unknown };
				const from = nodeIds[edge.from as number];
				const to = nodeIds[edge.to as number];
				if (!from || !to || from === to) continue;
				edges[id()] = { from, to };
			}

			flows[flowId] = {
				name: typeof grind.name === 'string' ? grind.name : '',
				nodes,
				nodeOrder,
				edges
			};
		}

		const ref = doc(db, 'boards', data.boardId);
		await updateDoc(ref, {
			updatedAt: serverTimestamp(),
			// only adopt the imported name if this board hasn't been named yet
			...(board.name ? {} : { name: typeof source.name === 'string' ? source.name : '' }),
			flowOrder,
			flows
		});
		importModalOpen = false;
		importDone = true;
		setTimeout(() => (importDone = false), 1500);
		return null;
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
					flows: snapData.flows ?? {},
					shareId: snapData.shareId
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

	function startEditingFlowName(flowId: string, currentName: string) {
		flowNameDraft = currentName;
		editingFlowNameId = flowId;
	}

	async function saveFlowName(e: SubmitEvent, flowId: string) {
		e.preventDefault();
		const ref = doc(db, 'boards', data.boardId);
		await updateDoc(ref, {
			updatedAt: serverTimestamp(),
			[`flows.${flowId}.name`]: flowNameDraft.trim()
		});
		editingFlowNameId = null;
	}

	function cancelEditingFlowName() {
		editingFlowNameId = null;
	}

	type ConfirmData = {
		title: string;
		message: string;
		perform: () => Promise<void> | void;
	};
	let confirmData = $state<ConfirmData | null>(null);

	type WikiMenuData = { label: string; wikiLink: string; x: number; y: number };
	let wikiMenu = $state<WikiMenuData | null>(null);

	function openWikiMenu(e: MouseEvent, label: string, wikiLink: string) {
		if (!wikiLink) return;
		e.preventDefault();
		wikiMenu = { label, wikiLink, x: e.clientX, y: e.clientY };
	}

	function cancelConfirm() {
		confirmData = null;
	}

	async function runConfirm() {
		const perform = confirmData?.perform;
		confirmData = null;
		await perform?.();
	}

	async function doDeleteBoard() {
		// Server action, so it can also delete the shareLinks mapping doc
		// (client has no access to that collection).
		await fetch('?/deleteBoard', {
			method: 'POST',
			headers: { 'x-sveltekit-action': 'true' },
			body: new FormData()
		});
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

	async function createEntry(draft: EntryDraft, flowName?: string) {
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
					name: flowName?.trim() ?? '',
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

	function handleModalSubmit(draft: EntryDraft, flowName?: string) {
		if (editTarget) updateEntry(editTarget, draft);
		else createEntry(draft, flowName);
	}
</script>

<svelte:head>
	<title>{board.name || `Board ${data.boardId}`}</title>
</svelte:head>

{#if modalOpen}
	<EntryModal
		initial={editInitial}
		isNewFlow={addTarget === null && editTarget === null}
		onsubmit={handleModalSubmit}
		oncancel={closeModal}
	/>
{/if}

{#if confirmData}
	<ConfirmModal
		title={confirmData.title}
		message={confirmData.message}
		onconfirm={runConfirm}
		oncancel={cancelConfirm}
	/>
{/if}

{#if importModalOpen}
	<ImportModal onsubmit={importBoard} oncancel={() => (importModalOpen = false)} />
{/if}

{#if wikiMenu}
	<EntryContextMenu
		label={wikiMenu.label}
		wikiLink={wikiMenu.wikiLink}
		x={wikiMenu.x}
		y={wikiMenu.y}
		onclose={() => (wikiMenu = null)}
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
	{#if !editMode}
		<button class="share-board" onclick={copyShareLink}>
			{shareLinkCopied ? 'Copied!' : 'Share'}
		</button>
	{/if}
	<button class="edit-board" onclick={toggleEditMode}
		>{editMode ? 'Exit' : 'Edit'}</button
	>
	{#if editMode}
		{#if isBlank}
			<button class="import-board" onclick={() => (importModalOpen = true)}>
				{importDone ? 'Imported!' : 'Import'}
			</button>
		{:else}
			<button class="export-board" onclick={copyExport}>
				{exportCopied ? 'Copied!' : 'Export'}
			</button>
		{/if}
		<button class="delete-board" onclick={askDeleteBoard}>Delete</button>
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
		{#if editMode}
			{#if editingFlowNameId === flowId}
				<form onsubmit={(e) => saveFlowName(e, flowId)} class="flow-name-form">
					<!-- svelte-ignore a11y_autofocus -->
					<input
						bind:value={flowNameDraft}
						onblur={cancelEditingFlowName}
						onkeydown={(e) => {
							if (e.key === 'Escape') cancelEditingFlowName();
						}}
						onfocus={(e) => e.currentTarget.select()}
						autofocus
					/>
				</form>
			{:else}
				<span
					class="flow-name"
					role="button"
					tabindex="0"
					onclick={() => startEditingFlowName(flowId, flow?.name ?? '')}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ')
							startEditingFlowName(flowId, flow?.name ?? '');
					}}
				>
					{flow?.name || 'Edit name'}
				</span>
			{/if}
		{:else if flow?.name}
			<span class="flow-name">{flow.name}</span>
		{/if}
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
							oncontextmenu={(e) => !editMode && openWikiMenu(e, entry.label, entry.wikiLink)}
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
		padding: 0.75rem;
		background: var(--osrs-parchment);
		border: 2px solid var(--osrs-brown-dark);
	}

	.flow-name {
		flex-shrink: 0;
		max-width: 6rem;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--osrs-brown);
		text-align: right;
		overflow-wrap: break-word;
		margin-right: 0.75rem;
	}

	.flow-name-form {
		flex-shrink: 0;
		margin-right: 0.75rem;
	}

	.flow-name-form input {
		width: 6rem;
		font-size: 0.9rem;
		font-weight: 600;
		text-align: right;
	}

	.flow.editing {
		border-color: var(--osrs-brown);
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
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.25rem;
	}

	.edge-arrow {
		font-size: 1.5rem;
		margin: 0 0.5rem;
		color: var(--osrs-brown);
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
		background: var(--osrs-parchment-light);
		border: 1px solid var(--osrs-brown-dark);
	}

	.entry-cell:not(.editing) {
		cursor: pointer;
	}

	.entry-cell.done {
		background: var(--osrs-done);
	}

	.entry-cell img {
		max-width: 85%;
		max-height: 85%;
	}

	.icon-placeholder {
		font-size: 1.25rem;
		font-weight: bold;
		color: var(--osrs-brown);
	}

	.level-badge {
		position: absolute;
		bottom: 0.1rem;
		left: 0.1rem;
		font-size: 0.65rem;
		line-height: 1;
		padding: 0.05rem 0.2rem;
		background: rgba(0, 0, 0, 0.75);
		color: var(--osrs-parchment-light);
		border-radius: 0.2rem;
	}

	.entry-delete-button {
		position: absolute;
		top: -0.5rem;
		right: -0.5rem;
		z-index: 1;
		width: 1.25rem;
		height: 1.25rem;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
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
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
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
