import type { Action } from 'svelte/action';

const HOLD_MS = 500;
const MOVE_TOLERANCE_PX = 10;
// How long after a fired long press to swallow the click the release may produce,
// so the long press doesn't also count as a tap (e.g. toggling an entry done).
const CLICK_SUPPRESS_MS = 400;

/**
 * Touch long-press -> callback with the press position, for opening the same
 * menus a desktop right-click opens. Needed for iOS Safari, which never fires
 * `contextmenu` on long press. Android Chrome does, so a native `contextmenu`
 * during the hold cancels this one to avoid handling the press twice.
 */
export const longpress: Action<HTMLElement, (x: number, y: number) => void> = (node, callback) => {
	let cb = callback;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let startX = 0;
	let startY = 0;
	let fired = false;
	let suppressClickUntil = 0;

	function cancel() {
		if (timer) clearTimeout(timer);
		timer = null;
	}

	function onPointerDown(e: PointerEvent) {
		if (e.pointerType !== 'touch') return;
		cancel();
		fired = false;
		suppressClickUntil = 0;
		startX = e.clientX;
		startY = e.clientY;
		timer = setTimeout(() => {
			timer = null;
			fired = true;
			suppressClickUntil = Infinity;
			cb(startX, startY);
		}, HOLD_MS);
	}

	function onPointerMove(e: PointerEvent) {
		if (!timer) return;
		if (Math.hypot(e.clientX - startX, e.clientY - startY) > MOVE_TOLERANCE_PX) cancel();
	}

	function onClick(e: MouseEvent) {
		if (Date.now() < suppressClickUntil) {
			e.stopImmediatePropagation();
			e.preventDefault();
		}
		suppressClickUntil = 0;
	}

	function onPointerUp() {
		cancel();
		if (fired) suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
		fired = false;
	}

	node.addEventListener('pointerdown', onPointerDown);
	node.addEventListener('pointermove', onPointerMove);
	node.addEventListener('pointerup', onPointerUp);
	node.addEventListener('pointercancel', onPointerUp);
	node.addEventListener('contextmenu', cancel);
	node.addEventListener('click', onClick, true);

	return {
		update(newCallback) {
			cb = newCallback;
		},
		destroy() {
			cancel();
			node.removeEventListener('pointerdown', onPointerDown);
			node.removeEventListener('pointermove', onPointerMove);
			node.removeEventListener('pointerup', onPointerUp);
			node.removeEventListener('pointercancel', onPointerUp);
			node.removeEventListener('contextmenu', cancel);
			node.removeEventListener('click', onClick, true);
		}
	};
};
