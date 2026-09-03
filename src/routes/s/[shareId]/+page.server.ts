import { error } from '@sveltejs/kit';
import { adminDb } from '$lib/server/firebase-admin';
import type { Board } from '$lib/types';
import type { PageServerLoad } from './$types';

// Resolves shareId -> boardId server-side (Admin SDK, bypasses security
// rules entirely) and returns only the board's content - never the real
// boardId. That's the actual security boundary for read-only sharing: the
// client for this route never has enough information to construct the
// real /b/[boardId] edit URL or call Firestore directly against it. See
// DESIGN.md's read-only sharing notes.
export const load: PageServerLoad = async ({ params }) => {
	const linkSnap = await adminDb.doc(`shareLinks/${params.shareId}`).get();
	if (!linkSnap.exists) {
		error(404, 'Board not found');
	}
	const { boardId } = linkSnap.data()!;

	const boardSnap = await adminDb.doc(`boards/${boardId}`).get();
	if (!boardSnap.exists) {
		error(404, 'Board not found');
	}

	const data = boardSnap.data()!;
	const board: Board = {
		name: data.name ?? '',
		flowOrder: data.flowOrder ?? [],
		flows: data.flows ?? {},
		shareId: params.shareId
	};

	return { board };
};
