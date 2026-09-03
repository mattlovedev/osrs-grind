#!/bin/sh
# One-off: build the image and push it to the Artifact Registry repo
# created in the previous step. --platform=linux/amd64 is explicit
# because Cloud Run expects amd64, and a Mac (especially Apple Silicon)
# would otherwise build for its own native architecture by default.
set -e

IMAGE=us-central1-docker.pkg.dev/osrs-grind/grind-app/grind-app:latest

# One-time: lets `docker push` authenticate to Artifact Registry using
# your gcloud identity, no separate login/token step needed. Safe to
# re-run - it's idempotent.
gcloud auth configure-docker us-central1-docker.pkg.dev

docker build --platform=linux/amd64 -t "$IMAGE" .
docker push "$IMAGE"

echo ""
echo "Pushed: $IMAGE"
