import { error } from '@sveltejs/kit';
import { adminDb } from '$lib/server/firebase-admin';
import type { Board } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const snap = await adminDb.doc(`boards/${params.boardId}`).get();
	if (!snap.exists) {
		error(404, 'Board not found');
	}

	const data = snap.data()!;
	const board: Board = {
		name: data.name ?? '',
		flowOrder: data.flowOrder ?? [],
		flows: data.flows ?? {},
		shareId: data.shareId,
		icon: data.icon ?? null
	};

	return { boardId: params.boardId, board };
};

export const actions: Actions = {
	// Deleting a board also removes its shareLinks/{shareId} mapping doc.
	// That doc is created server-side in createBoard and the client can't
	// touch it (firestore.rules denies all client access to shareLinks),
	// so the cleanup has to run here with the Admin SDK too - otherwise
	// every deleted board leaves an orphaned mapping behind.
	deleteBoard: async ({ params }) => {
		const ref = adminDb.doc(`boards/${params.boardId}`);
		const snap = await ref.get();

		const batch = adminDb.batch();
		batch.delete(ref);
		const shareId = snap.exists ? snap.data()?.shareId : undefined;
		if (typeof shareId === 'string' && shareId) {
			batch.delete(adminDb.doc(`shareLinks/${shareId}`));
		}
		await batch.commit();

		return { deleted: true };
	}
};
