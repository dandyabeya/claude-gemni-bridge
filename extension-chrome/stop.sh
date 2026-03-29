#!/bin/bash
PIDFILE="$HOME/.claude/gemini-bridge/server.pid"

if [ -f "$PIDFILE" ]; then
  kill "$(cat "$PIDFILE")" 2>/dev/null
  rm "$PIDFILE"
  echo "Bridge server stopped"
else
  echo "No server running"
fi
