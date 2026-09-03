import { dev } from '$app/environment';

// catalog.json and saved Entry documents both store icon as a plain local
// path (e.g. "/icons/bosses/dagannoth-rex.png") or null - environment-
// agnostic on purpose, see scripts/04-assemble-catalog.mjs. This is the
// one place that decides how to actually serve it: in dev, straight from
// static/icons/ (so a fresh `npm run scrape` is visible immediately, no
// publish step); in production, prefixed onto the public osrs-grind-icons
// GCS bucket, which is where the real files live once published via
// `gcloud storage rsync` - see DESIGN.md "Roadmap - deployment".
//
// Applied at render time, not baked into stored data, so the exact same
// catalog.json and the exact same already-saved Firestore entries render
// correctly in both places without needing separate data per environment.
const GCS_ICON_BASE_URL = 'https://storage.googleapis.com/osrs-grind-icons';

export function iconUrl(path: string | null | undefined): string | null {
	if (!path) return null;
	return dev ? path : `${GCS_ICON_BASE_URL}${path}`;
}
