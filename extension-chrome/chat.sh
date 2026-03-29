#!/bin/bash
# Interactive chat with Gemini from your terminal
# Usage:
#   chat.sh -c channel-name "message"   — send to specific channel
#   chat.sh -c channel-name             — interactive mode on a channel
#   chat.sh "message"                   — send on default channel
#   chat.sh                             — interactive mode on default channel
#   chat.sh --list                      — list all channels

BRIDGE="$HOME/.claude/gemini-bridge"
SERVER_URL="http://127.0.0.1:52945"
CHANNEL="default"
MESSAGE=""

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    -c|--channel)
      CHANNEL="$2"
      shift 2
      ;;
    --list)
      echo "=== Active Channels ==="
      curl -s "$SERVER_URL/channels" | python3 -c "
import sys, json
channels = json.load(sys.stdin)
if not channels:
    print('  No channels yet.')
else:
    for c in channels:
        print(f'  - {c}')
" 2>/dev/null
      exit 0
      ;;
    *)
      MESSAGE="$*"
      break
      ;;
  esac
done

# Check if server is running, start it if not
if ! curl -s "$SERVER_URL/health" > /dev/null 2>&1; then
  echo "Starting bridge server..."
  "$BRIDGE/start.sh"
  sleep 1
fi

send_and_wait() {
  local msg="$1"
  local old_response
  old_response=$(curl -s "$SERVER_URL/c/${CHANNEL}/response" 2>/dev/null)

  # Send the message
  "$BRIDGE/send-update.sh" "$msg" "user" "message" "$CHANNEL"
  echo ">>> Sent on channel '$CHANNEL'. Waiting for Gemini..."

  # Wait for a new response
  local attempts=0
  while [ $attempts -lt 90 ]; do
    sleep 2
    local new_response
    new_response=$(curl -s "$SERVER_URL/c/${CHANNEL}/response" 2>/dev/null)

    if [ "$new_response" != "$old_response" ]; then
      local resp
      resp=$(echo "$new_response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('response',''))" 2>/dev/null)
      if [ -n "$resp" ]; then
        echo ""
        echo "<<< Gemini [${CHANNEL}]:"
        echo "$resp"
        echo ""
        return 0
      fi
    fi
    attempts=$((attempts + 1))
  done

  echo "Timed out waiting for response."
  return 1
}

# Single message mode
if [ -n "$MESSAGE" ]; then
  send_and_wait "$MESSAGE"
  exit $?
fi

# Interactive mode
echo "=== Gemini Chat [channel: $CHANNEL] ==="
echo "Type your message and press Enter. Type 'quit' to exit."
echo ""

while true; do
  read -r -p "You: " input
  if [ "$input" = "quit" ] || [ "$input" = "exit" ]; then
    echo "Bye!"
    break
  fi
  if [ -z "$input" ]; then
    continue
  fi
  send_and_wait "$input"
done
