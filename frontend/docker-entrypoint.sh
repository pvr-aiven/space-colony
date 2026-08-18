#!/bin/sh
set -e

# Regenerated on every container start (not at image build time) so that
# changing API_URL on Aiven Runtime and redeploying takes effect without a
# rebuild — the static bundle itself has no build-time knowledge of it.
cat > /usr/share/nginx/html/env.js <<EOF
window.__ENV__ = { API_URL: "${API_URL:-}" };
EOF

exec nginx -g "daemon off;"
