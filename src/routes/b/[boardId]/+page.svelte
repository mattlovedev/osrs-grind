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
	import type { Board, EntryType } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let liveBoard = $state<Board | null>(null);
	let board = $derived(liveBoard ?? data.board);
	let editingName = $state(false);
	let nameDraft = $state('');

	type AddTarget = { flowId: string; nodeId: string; mode: 'append' | 'edge' } | null;
	let addTarget = $state<AddTarget>(null);
	let addOpen = $state(false);
	let showSkillMenu = $state(false);
	let editMode = $state(false);

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

	function toggleEditMode() {
		editMode = !editMode;
		if (!editMode) closeAddFlow();
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

	async function deleteBoard() {
		if (!confirm('Delete this board? This cannot be undone.')) return;
		const ref = doc(db, 'boards', data.boardId);
		await deleteDoc(ref);
		goto(resolve('/'));
	}

	async function deleteFlow(flowId: string) {
		if (!confirm('Delete this grind? This cannot be undone.')) return;
		const ref = doc(db, 'boards', data.boardId);
		await updateDoc(ref, {
			updatedAt: serverTimestamp(),
			flowOrder: arrayRemove(flowId),
			[`flows.${flowId}`]: deleteField()
		});
	}

	async function deleteNode(flowId: string, nodeId: string) {
		const isLastNode = (board.flows[flowId]?.nodeOrder ?? []).length <= 1;
		if (isLastNode) {
			if (
				!confirm(
					'This is the last node in this grind - deleting it removes the whole grind. Continue?'
				)
			)
				return;
			const ref = doc(db, 'boards', data.boardId);
			await updateDoc(ref, {
				updatedAt: serverTimestamp(),
				flowOrder: arrayRemove(flowId),
				[`flows.${flowId}`]: deleteField()
			});
			return;
		}
		if (!confirm('Delete this node and everything in it? This cannot be undone.')) return;
		const ref = doc(db, 'boards', data.boardId);
		await updateDoc(ref, {
			updatedAt: serverTimestamp(),
			[`flows.${flowId}.nodeOrder`]: arrayRemove(nodeId),
			[`flows.${flowId}.nodes.${nodeId}`]: deleteField()
		});
	}

	async function deleteEntry(flowId: string, nodeId: string, entryId: string) {
		const isLastEntry = (board.flows[flowId]?.nodes[nodeId]?.entryOrder ?? []).length <= 1;
		if (isLastEntry) {
			await deleteNode(flowId, nodeId);
			return;
		}
		const ref = doc(db, 'boards', data.boardId);
		await updateDoc(ref, {
			updatedAt: serverTimestamp(),
			[`flows.${flowId}.nodes.${nodeId}.entryOrder`]: arrayRemove(entryId),
			[`flows.${flowId}.nodes.${nodeId}.entries.${entryId}`]: deleteField()
		});
	}

	async function toggleDone(flowId: string, nodeId: string, entryId: string, done: boolean) {
		if (editMode) return;
		const ref = doc(db, 'boards', data.boardId);
		await updateDoc(ref, {
			updatedAt: serverTimestamp(),
			[`flows.${flowId}.nodes.${nodeId}.entries.${entryId}.done`]: !done
		});
	}

	async function createGrind(type: EntryType, label: string, icon: string) {
		const ref = doc(db, 'boards', data.boardId);
		const entryId = crypto.randomUUID().slice(0, 8);
		if (addTarget?.mode === 'append') {
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
		} else if (addTarget?.mode === 'edge') {
			const { flowId, nodeId: fromNodeId } = addTarget;
			const newNodeId = crypto.randomUUID().slice(0, 8);
			const edgeId = crypto.randomUUID().slice(0, 8);
			await updateDoc(ref, {
				updatedAt: serverTimestamp(),
				[`flows.${flowId}.nodes.${newNodeId}`]: {
					entries: { [entryId]: { type, label, icon, done: false } },
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
							entries: { [entryId]: { type, label, icon, done: false } },
							entryOrder: [entryId]
						}
					},
					nodeOrder: [nodeId],
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
				onfocus={(e) => e.currentTarget.select()}
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

<div class="top-right-actions">
	<button class="edit-board" onclick={toggleEditMode}
		>{editMode ? 'Exit edit' : 'Edit board'}</button
	>
	<button class="delete-board" onclick={deleteBoard}>Delete board</button>
</div>

{#each board.flowOrder as flowId (flowId)}
	{@const flow = board.flows[flowId]}
	<div class="flow" class:editing={editMode}>
		<button class="flow-delete-button" title="Delete grind" onclick={() => deleteFlow(flowId)}>
			&times;
		</button>
		{#each flow?.nodeOrder ?? Object.keys(flow?.nodes ?? {}) as nodeId, i (nodeId)}
			{@const node = flow.nodes[nodeId]}
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
							role="button"
							tabindex="0"
							onclick={() => toggleDone(flowId, nodeId, entryId, entry.done)}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ')
									toggleDone(flowId, nodeId, entryId, entry.done);
							}}
						>
							{#if entry.icon}
								<img src={entry.icon} alt={entry.label} />
							{/if}
							{#if levelFromLabel(entry.label)}
								<span class="level-badge">{levelFromLabel(entry.label)}</span>
							{/if}
							<button
								class="entry-delete-button"
								title="Delete entry"
								onclick={(e) => {
									e.stopPropagation();
									deleteEntry(flowId, nodeId, entryId);
								}}
							>
								&times;
							</button>
						</div>
					{/each}
				</div>
				{#if addOpen && addTarget?.flowId === flowId && addTarget?.nodeId === nodeId}
					{@render addMenu()}
				{:else}
					<button
						class="node-add-button"
						title="Add to this node"
						onclick={() => openAddMenu({ flowId, nodeId, mode: 'append' })}
					>
						+
					</button>
					<button
						class="node-edge-button"
						title="Add connected grind"
						onclick={() => openAddMenu({ flowId, nodeId, mode: 'edge' })}
					>
						&rarr;
					</button>
					<button
						class="node-delete-button"
						title="Delete node"
						onclick={() => deleteNode(flowId, nodeId)}
					>
						&times;
					</button>
				{/if}
			</div>
		{/each}
	</div>
{/each}

{#if editMode}
	{#if addOpen && addTarget === null}
		{@render addMenu()}
	{:else if addTarget === null}
		<button class="add-flow-button" title="Add grind" onclick={() => openAddMenu(null)}>+</button>
	{/if}
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

	.flow-delete-button {
		position: absolute;
		top: 50%;
		left: -1rem;
		transform: translateY(-50%);
		z-index: 1;
		width: 2rem;
		height: 2rem;
		font-size: 1.25rem;
		opacity: 0;
		pointer-events: none;
	}

	.flow.editing:hover .flow-delete-button,
	.flow.editing:focus-within .flow-delete-button {
		opacity: 1;
		pointer-events: auto;
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
