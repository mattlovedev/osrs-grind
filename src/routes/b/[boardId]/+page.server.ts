import { error } from '@sveltejs/kit';
import { adminDb } from '$lib/server/firebase-admin';
import type { Board } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const snap = await adminDb.doc(`boards/${params.boardId}`).get();
	if (!snap.exists) {
		error(404, 'Board not found');
	}

	const data = snap.data()!;
	const board: Board = {
		name: data.name ?? '',
		flowOrder: data.flowOrder ?? [],
		flows: data.flows ?? {}
	};

	return { boardId: params.boardId, board };
};
