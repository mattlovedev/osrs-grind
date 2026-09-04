#!/bin/sh
# Needed for SvelteKit's form-action CSRF check (createBoard) to accept
# requests - see DESIGN.md "Roadmap - deployment", punch list item 5. This
# doesn't trigger a rebuild, just an env var update + new revision using
# the same image.
#
# Uses adapter-node's dynamic origin detection (PROTOCOL_HEADER/HOST_HEADER)
# rather than a static ORIGIN, since the service is reachable at multiple
# domains (the raw .run.app URL and grind.mattlove.dev, with more custom
# domains possibly mapped later) - Cloud Run's proxy sets these forwarded
# headers correctly per-request for whichever domain the client used, so
# there's no fixed value to keep in sync as domains are added.
set -e

gcloud run services update grind-app \
  --region=us-central1 \
  --project=osrs-grind \
  --update-env-vars=PROTOCOL_HEADER=x-forwarded-proto,HOST_HEADER=x-forwarded-host \
  --remove-env-vars=ORIGIN
