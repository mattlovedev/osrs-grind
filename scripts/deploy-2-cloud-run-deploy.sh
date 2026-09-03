#!/bin/sh
# One-off: first Cloud Run deploy. --allow-unauthenticated because this
# app has no auth model at all (capability URLs, anyone with the link can
# use it - see DESIGN.md "Access model") - without this flag Cloud Run
# defaults to requiring IAM-authenticated requests, which would make the
# app unreachable to normal visitors.
#
# ORIGIN isn't set yet - Cloud Run assigns the URL as part of this deploy,
# so it can't be known beforehand. We'll set it as a follow-up once we see
# what URL comes back.
set -e

gcloud run deploy grind-app \
  --image=us-central1-docker.pkg.dev/osrs-grind/grind-app/grind-app:latest \
  --region=us-central1 \
  --project=osrs-grind \
  --service-account=firebase-adminsdk-fbsvc@osrs-grind.iam.gserviceaccount.com \
  --allow-unauthenticated
