#!/bin/bash
# Sends an update to the Gemini Bridge server
# Usage: send-update.sh "message" [project] [status] [channel]

MESSAGE="${1:-No message provided}"
PROJECT="${2:-default}"
STATUS="${3:-update}"
CHANNEL="${4:-default}"

curl -s -X POST "http://127.0.0.1:52945/c/${CHANNEL}/updates" \
  -H "Content-Type: application/json" \
  -d "$(cat <<EOF
{
  "message": $(echo "$MESSAGE" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read().strip()))'),
  "project": "$PROJECT",
  "status": "$STATUS"
}
EOF
)" > /dev/null 2>&1
