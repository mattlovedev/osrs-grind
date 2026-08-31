import { redirect } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '$lib/server/firebase-admin';
import type { Actions } from './$types';

export const actions: Actions = {
	createBoard: async () => {
		const boardId = nanoid(12);
		await adminDb
			.doc(`boards/${boardId}`)
			.set({ updatedAt: FieldValue.serverTimestamp(), flowOrder: [], flows: {} });
		redirect(303, `/b/${boardId}`);
	}
};
