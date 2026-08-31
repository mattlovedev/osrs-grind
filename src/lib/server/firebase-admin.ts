import { getApps, getApp, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { PUBLIC_FIREBASE_PROJECT_ID } from '$env/static/public';

const app = getApps().length
	? getApp()
	: initializeApp({
			credential: applicationDefault(),
			projectId: PUBLIC_FIREBASE_PROJECT_ID
		});

export const adminDb = getFirestore(app);
