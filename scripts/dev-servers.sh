#!/usr/bin/env bash
# Start/stop the backend (FastAPI, :8000) and frontend (Vite, :5173) dev servers
# in the background. PIDs and logs live under .run/. Used by `make run` / `make stop`.
#
# macOS has no `setsid`, so to stop cleanly we kill the whole process tree of
# each launched process (uvicorn --reload and `npm run dev` both spawn children).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN_DIR="$REPO_ROOT/.run"
BACKEND_PID="$RUN_DIR/backend.pid"
FRONTEND_PID="$RUN_DIR/frontend.pid"
BACKEND_LOG="$RUN_DIR/backend.log"
FRONTEND_LOG="$RUN_DIR/frontend.log"

is_running() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }

# Echo a pid and all its descendants (deepest first).
collect_tree() {
    local pid="$1" child
    for child in $(pgrep -P "$pid" 2>/dev/null || true); do
        collect_tree "$child"
    done
    echo "$pid"
}

# Terminate a process tree: SIGTERM, then SIGKILL anything still alive.
kill_tree() {
    local pids survivor p
    pids="$(collect_tree "$1")"
    kill $pids 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do
        survivor=""
        for p in $pids; do is_running "$p" && survivor="$survivor $p"; done
        [ -z "$survivor" ] && return 0
        sleep 0.2
    done
    kill -9 $survivor 2>/dev/null || true
}

start() {
    mkdir -p "$RUN_DIR"
    if [ -f "$BACKEND_PID" ] && is_running "$(cat "$BACKEND_PID")"; then
        echo "Backend already running (pid $(cat "$BACKEND_PID")). Run 'make stop' first." >&2
        exit 1
    fi
    if [ -f "$FRONTEND_PID" ] && is_running "$(cat "$FRONTEND_PID")"; then
        echo "Frontend already running (pid $(cat "$FRONTEND_PID")). Run 'make stop' first." >&2
        exit 1
    fi

    echo "Installing dependencies…"
    (cd "$REPO_ROOT/src/backend" && uv sync)
    (cd "$REPO_ROOT/src/frontend" && npm install)

    echo "Starting backend  → http://localhost:8000  (log: .run/backend.log)"
    (cd "$REPO_ROOT/src/backend" && exec uv run uvicorn app.main:app --reload --port 8000) \
        >"$BACKEND_LOG" 2>&1 &
    echo $! >"$BACKEND_PID"

    echo "Starting frontend → http://localhost:5173  (log: .run/frontend.log)"
    (cd "$REPO_ROOT/src/frontend" && exec npm run dev) >"$FRONTEND_LOG" 2>&1 &
    echo $! >"$FRONTEND_PID"

    # Wait briefly for Vite to report its actual URL (it may shift port if 5173
    # is taken), so the printed link is correct and clickable.
    local app_url="http://localhost:5173/" found
    for _ in $(seq 1 30); do
        found="$(grep -oE 'http://localhost:[0-9]+/?' "$FRONTEND_LOG" 2>/dev/null | head -1 || true)"
        if [ -n "$found" ]; then
            app_url="$found"
            break
        fi
        sleep 0.2
    done

    echo
    echo "  Nodus is running:"
    echo "    App  →  $app_url"
    echo "    API  →  http://localhost:8000  (docs: http://localhost:8000/docs)"
    echo
    echo "  Stop with 'make stop'. Logs: tail -f .run/*.log"
}

stop() {
    local stopped=0 f pid
    for f in "$BACKEND_PID" "$FRONTEND_PID"; do
        [ -f "$f" ] || continue
        pid="$(cat "$f")"
        if is_running "$pid"; then
            kill_tree "$pid"
            stopped=1
        fi
        rm -f "$f"
    done
    if [ "$stopped" -eq 1 ]; then
        echo "Stopped backend + frontend."
    else
        echo "Nothing to stop."
    fi
}

case "${1:-}" in
    start) start ;;
    stop) stop ;;
    *)
        echo "Usage: $0 {start|stop}" >&2
        exit 2
        ;;
esac
