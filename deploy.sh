#!/bin/bash

# ── STOP ────────────────────────────────────────────────────────────────────
# DEAD TARGET. This rsyncs Foodsum/ to /opt/Foodsum on the droplet 165.22.216.48,
# where each app then materialised it into node_modules/@suite/*. That is not
# how Foodsum reaches an app any more.
#
# On the VPS (200.234.42.67), /srv/lumen/Foodsum is its own git checkout and every
# app's Dockerfile COPYs it in from the build context — which is why the build
# context is /srv/lumen and not the app folder. So a Foodsum change reaches an app
# by being PULLED on the VPS and REBUILT into that app's image:
#
#     cd Lumen && ./deploy-vps.sh <App>      # pulls Foodsum, then rebuilds
#
# There is no separate Foodsum deploy to run: nothing consumes /opt/Foodsum.
# Remember the blast radius is still every app — each one picks Foodsum up on its
# NEXT build, so a Foodsum change is not live anywhere until those apps redeploy.
#
# Set DEPLOY_TO_DROPLET=1 if you genuinely mean the droplet.
if [ "${DEPLOY_TO_DROPLET:-0}" != "1" ]; then
  echo "✗ Foodsum/deploy.sh targets the DROPLET, which no longer serves the suite." >&2
  echo "  Foodsum reaches an app by being pulled on the VPS and rebuilt into it:" >&2
  echo "      cd Lumen && ./deploy-vps.sh <App>" >&2
  echo "  (DEPLOY_TO_DROPLET=1 to override.)" >&2
  exit 1
fi
# ────────────────────────────────────────────────────────────────────────────

set -e

# Foodsum (@suite/foodsum) deploy — syncs the shared package to the droplet
# ONCE, at the sibling path every app already references locally
# ("file:../Foodsum"). Same shape as Core/deploy.sh, with two differences
# that are the whole reason this script is short:
#
# 1. NO npm install. Foodsum has ZERO dependencies (`src/` imports nothing but
#    node:*) and no build step — it ships raw .ts, and consuming apps transpile
#    it (`transpilePackages: ['@suite/foodsum']`). So there is nothing to
#    install and nothing to compile; the rsync IS the deploy. That is also why
#    there is no node_modules health check like Core's.
#
# 2. `corpus/images/` is EXCLUDED. The images are served from jsDelivr off the
#    public GitHub repo (see corpus/README.md and Health's
#    NEXT_PUBLIC_FOODSUM_BASE), so the droplet never reads them — shipping
#    them would put a corpus that grows toward ~350 photographs on the box for
#    nothing, and would create a SECOND delivery path that can disagree with
#    the CDN about what a dish looks like. `corpus/index.json` is NOT excluded:
#    it is imported directly by the matcher and is the one corpus file the
#    running app genuinely needs.
#
# Library, not a service: no PM2 process, nothing to restart.

DROPLET_IP="165.22.216.48"
DROPLET_USER="root"
# Sibling of every app's /opt/<app> dir, so "file:../Foodsum" resolves on the
# droplet exactly as it does locally.
REMOTE_DIR="/opt/Foodsum"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "📤 Syncing Foodsum to droplet ($REMOTE_DIR)..."
ssh "$DROPLET_USER@$DROPLET_IP" "mkdir -p $REMOTE_DIR"
# -i (itemize) prints one line per file actually changed and nothing for files
# already in sync, so an empty result means the droplet is current. Same
# reporting contract as Core's, minus the install it gates there.
CHANGES="$(rsync -az --delete -i \
  --exclude='node_modules' \
  --exclude='ideas' \
  --exclude='inbox' \
  --exclude='corpus/images' \
  --exclude='.git' \
  --exclude='.DS_Store' \
  --exclude='.deploy-state.json' \
  "$LOCAL_DIR/" "$DROPLET_USER@$DROPLET_IP:$REMOTE_DIR/")"
[ -n "$CHANGES" ] && echo "$CHANGES"
[ -z "$CHANGES" ] && echo "✅ Foodsum unchanged."

cat > "$LOCAL_DIR/.deploy-state.json" <<EOF
{
  "lastRunAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "needsDeployment": $([ -z "$CHANGES" ] && echo false || echo true),
  "filesChanged": $(printf '%s\n' "$CHANGES" | grep -c . || true)
}
EOF

echo "✅ Foodsum deployed to $DROPLET_IP:$REMOTE_DIR — no dependencies, no build, no service to restart."
