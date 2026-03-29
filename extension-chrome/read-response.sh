#!/bin/bash
# Reads Gemini's last response from the bridge server
# Usage: read-response.sh [channel] [--raw]

CHANNEL="default"
RAW=false

for arg in "$@"; do
  if [ "$arg" = "--raw" ]; then
    RAW=true
  else
    CHANNEL="$arg"
  fi
done

RESP=$(curl -s "http://127.0.0.1:52945/c/${CHANNEL}/response" 2>/dev/null)

if [ -z "$RESP" ]; then
  echo "Error: Bridge server not reachable"
  exit 1
fi

if [ "$RAW" = true ]; then
  echo "$RESP"
else
  TIMESTAMP=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('timestamp','none'))" 2>/dev/null)
  RESPONSE=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('response',''))" 2>/dev/null)

  if [ -z "$RESPONSE" ] || [ "$RESPONSE" = "" ]; then
    echo "No response from Gemini yet on channel: $CHANNEL"
  else
    echo "=== Gemini Response [channel: ${CHANNEL}] (${TIMESTAMP}) ==="
    echo ""
    echo "$RESPONSE"
  fi
fi
