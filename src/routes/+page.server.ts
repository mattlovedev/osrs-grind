import { redirect } from '@sveltejs/kit';
import { customAlphabet } from 'nanoid';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '$lib/server/firebase-admin';
import type { Actions, PageServerLoad } from './$types';

// Letters only (upper + lower), no digits or symbols - 52^16 possible IDs,
// far beyond any realistic collision risk at this app's scale.
const generateBoardId = customAlphabet(
	'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
	16
);

// Public recents list - see docs/home-recents-spike.md for the reasoning.
// Deliberately a global feed of every board's activity, not per-viewer
// history. A projection query (.select) keeps the (potentially large)
// flows/flowOrder fields from ever leaving Firestore, and only name +
// shareId reach the client - never boardId, which would hand out edit
// access to a board nobody linked here.
export const load: PageServerLoad = async () => {
	const snap = await adminDb
		.collection('boards')
		.orderBy('updatedAt', 'desc')
		.limit(5)
		.select('name', 'shareId')
		.get();

	const recentBoards = snap.docs
		.map((doc) => doc.data())
		.filter((d): d is { name?: string; shareId: string } => typeof d.shareId === 'string')
		.map((d) => ({ name: d.name ?? '', shareId: d.shareId }));

	return { recentBoards };
};

export const actions: Actions = {
	createBoard: async () => {
		const boardId = generateBoardId();
		const shareId = generateBoardId();

		const batch = adminDb.batch();
		batch.set(adminDb.doc(`boards/${boardId}`), {
			updatedAt: FieldValue.serverTimestamp(),
			name: '',
			flowOrder: [],
			flows: {},
			shareId
		});
		// Every board is shareable from creation (see DESIGN.md's read-only
		// sharing notes) - this mapping is what actually makes /s/[shareId]
		// resolve. Regenerating later replaces this doc rather than adding
		// another, so a board only ever has one working share link.
		batch.set(adminDb.doc(`shareLinks/${shareId}`), { boardId });
		await batch.commit();

		redirect(303, `/b/${boardId}`);
	}
};
