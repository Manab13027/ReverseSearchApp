#!/usr/bin/env zsh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Load .env if present
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

PORT=${PORT:-42000}
URL="http://localhost:$PORT"
APP_PID=""

# Free the port on exit (Ctrl+C, kill, or terminal close)
cleanup() {
  echo "\nShutting down..."
  if [ -n "$APP_PID" ] && kill -0 "$APP_PID" 2>/dev/null; then
    kill "$APP_PID" 2>/dev/null
    wait "$APP_PID" 2>/dev/null
    echo "Server stopped. Port $PORT freed."
  fi
  # Also free the port if something else is still holding it
  local leftover
  leftover=$(lsof -ti tcp:$PORT 2>/dev/null)
  if [ -n "$leftover" ]; then
    kill $leftover 2>/dev/null
  fi
}
trap cleanup EXIT INT TERM

# Start Tor if not already running
if ! pgrep -x tor > /dev/null; then
  echo "Starting Tor..."
  tor &

  # Wait until Tor's SOCKS port is open (up to 30s)
  echo -n "Waiting for Tor to bootstrap"
  for i in $(seq 1 30); do
    if nc -z 127.0.0.1 9050 2>/dev/null; then
      echo " done."
      break
    fi
    echo -n "."
    sleep 1
  done
  echo ""
else
  echo "Tor already running."
fi

# Start the app
echo "Starting Reverse Trace on $URL"
node server.js &
APP_PID=$!

# Wait briefly for the server to bind then open browser
sleep 1
open "$URL"

# Wait for app to exit (keeps script alive; Ctrl+C triggers cleanup)
wait $APP_PID
