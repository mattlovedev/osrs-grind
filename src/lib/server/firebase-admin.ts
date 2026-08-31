import { dev } from '$app/environment';
import { getApps, getApp, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { PUBLIC_FIREBASE_PROJECT_ID } from '$env/static/public';

// Point local dev at the Firestore emulator instead of live data. The Admin
// SDK auto-detects this env var and skips real auth entirely, so ADC isn't
// even required for local dev anymore (only for scripts that need real data).
if (dev) {
	process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
}

const app = getApps().length
	? getApp()
	: initializeApp({
			credential: applicationDefault(),
			projectId: PUBLIC_FIREBASE_PROJECT_ID
		});

export const adminDb = getFirestore(app);
