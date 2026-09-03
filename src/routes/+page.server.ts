import { redirect } from '@sveltejs/kit';
import { customAlphabet } from 'nanoid';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '$lib/server/firebase-admin';
import type { Actions } from './$types';

// Letters only (upper + lower), no digits or symbols - 52^16 possible IDs,
// far beyond any realistic collision risk at this app's scale.
const generateBoardId = customAlphabet(
	'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
	16
);

export const actions: Actions = {
	createBoard: async () => {
		const boardId = generateBoardId();
		await adminDb
			.doc(`boards/${boardId}`)
			.set({ updatedAt: FieldValue.serverTimestamp(), name: '', flowOrder: [], flows: {} });
		redirect(303, `/b/${boardId}`);
	}
};
