#!/bin/bash
# Start the Gemini Bridge server
# Run this before using Claude Code if you want updates sent to Gemini

PIDFILE="$HOME/.claude/gemini-bridge/server.pid"
LOGFILE="$HOME/.claude/gemini-bridge/server.log"

# Check if already running
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "Bridge server already running (PID $(cat "$PIDFILE"))"
  exit 0
fi

# Start server in background
nohup node "$HOME/.claude/gemini-bridge/server.js" > "$LOGFILE" 2>&1 &
echo $! > "$PIDFILE"
echo "Bridge server started (PID $!) — logging to $LOGFILE"
