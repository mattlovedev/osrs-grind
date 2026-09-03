#!/bin/sh
# One-off follow-up to the first deploy: ORIGIN couldn't be known until
# Cloud Run assigned the service URL. Needed for SvelteKit's form-action
# CSRF check (createBoard) to accept requests - see DESIGN.md "Roadmap -
# deployment", punch list item 5. This doesn't trigger a rebuild, just an
# env var update + new revision using the same image.
set -e

gcloud run services update grind-app \
  --region=us-central1 \
  --project=osrs-grind \
  --update-env-vars=ORIGIN=https://grind-app-549755295105.us-central1.run.app
