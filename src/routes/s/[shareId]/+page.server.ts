import { error } from '@sveltejs/kit';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '$lib/server/firebase-admin';
import type { Board } from '$lib/types';
import type { PageServerLoad } from './$types';

// Resolves shareId -> boardId server-side (Admin SDK, bypasses security
// rules entirely) and returns only the board's content - never the real
// boardId. That's the actual security boundary for read-only sharing: the
// client for this route never has enough information to construct the
// real /b/[boardId] edit URL or call Firestore directly against it. See
// DESIGN.md's read-only sharing notes.

// Link-preview fetchers (Discord, iMessage, Slack, etc.) and crawlers - a
// pasted link shouldn't register as someone looking at the board.
const BOT_UA =
	/bot|crawl|spider|preview|facebookexternalhit|slack|discord|whatsapp|telegram|embedly|headless/i;

// One-year cookie scoped to this share link's path, so a browser counts as
// one view per board no matter how often it refreshes or comes back.
const VIEWED_COOKIE = 'viewed';
const VIEWED_MAX_AGE = 60 * 60 * 24 * 365;

export const load: PageServerLoad = async ({ params, cookies, request }) => {
	const linkSnap = await adminDb.doc(`shareLinks/${params.shareId}`).get();
	if (!linkSnap.exists) {
		error(404, 'Board not found');
	}
	const { boardId } = linkSnap.data()!;

	const boardSnap = await adminDb.doc(`boards/${boardId}`).get();
	if (!boardSnap.exists) {
		error(404, 'Board not found');
	}

	// Count stored on the shareLinks doc rather than the board: the client
	// can't touch shareLinks at all, so the count can't be tampered with, and
	// it doesn't fire the edit page's onSnapshot on every view. See
	// DESIGN.md's view count notes.
	const isBot = BOT_UA.test(request.headers.get('user-agent') ?? '');
	if (!isBot && !cookies.get(VIEWED_COOKIE)) {
		await linkSnap.ref.update({ viewCount: FieldValue.increment(1) });
		cookies.set(VIEWED_COOKIE, '1', {
			path: `/s/${params.shareId}`,
			maxAge: VIEWED_MAX_AGE
		});
	}

	const data = boardSnap.data()!;
	const board: Board = {
		name: data.name ?? '',
		flowOrder: data.flowOrder ?? [],
		flows: data.flows ?? {},
		shareId: params.shareId,
		icon: data.icon ?? null,
		// Private scratchpad - never sent to the public read-only share view,
		// even though nothing here currently renders it.
		notes: ''
	};

	return { board };
};
