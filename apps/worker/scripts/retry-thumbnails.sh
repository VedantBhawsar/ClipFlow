#!/usr/bin/env bash
# retry-thumbnails.sh — operational script to retry thumbnail generation for a video.
#
# Use case: a video is stuck (e.g. provider auth/quota issue resolved, recovery
# finalized it too early, etc.) and you need to re-run the thumbnails job from
# scratch. This script:
#
#   1. Kills the running worker (so a fresh boot reads the updated .env).
#   2. Resets the video status to GENERATING + clears failureReason.
#   3. Deletes all ThumbnailGeneration rows for the video (PENDING/PROCESSING/
#      COMPLETED/FAILED — anything, so the worker's idempotency check starts
#      clean).
#   4. Purges stale BullMQ thumbnails-job hashes + sorted-set entries for the
#      video (BullMQ dedupes by jobId across all states, including completed,
#      so the recovery pass can re-enqueue).
#   5. Restarts the worker in the background; the new startup-recovery pass
#      (`recoverOrphanedThumbnailsJobs`) sees GENERATING + chaptersJson + no
#      completed ThumbnailGeneration and re-enqueues onto the thumbnails queue.
#   6. Tails the worker log so you can watch the run live.
#
# Usage:
#   apps/worker/scripts/retry-thumbnails.sh <videoId>
#
# Requires:
#   - pnpm (workspace root)
#   - docker compose services up (postgres, redis)
#   - apps/worker/.env with a working IMAGE_GEN_PROVIDER + key
#
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <videoId>" >&2
  exit 2
fi

VIDEO_ID="$1"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKER_DIR="$ROOT_DIR/apps/worker"
LOG_DIR="${CLIPFLOW_LOG_DIR:-/tmp/clipflow-logs}"
LOG_FILE="$LOG_DIR/worker.log"
PG_CONTAINER="${PG_CONTAINER:-clipflow-postgres}"
REDIS_CONTAINER="${REDIS_CONTAINER:-clipflow-redis}"

mkdir -p "$LOG_DIR"

echo "==> Video:    $VIDEO_ID"
echo "==> Worker:   $WORKER_DIR"
echo "==> Log:      $LOG_FILE"
echo

# ---- 2. Reset video status to GENERATING ----
echo "[2/5] Resetting video status to GENERATING…"
docker exec "$PG_CONTAINER" psql -U clipflow -d clipflow -v ON_ERROR_STOP=1 -q <<SQL
UPDATE videos
SET status = 'GENERATING',
    "failureReason" = NULL,
    "updatedAt" = NOW()
WHERE id = '$VIDEO_ID';
SQL
docker exec "$PG_CONTAINER" psql -U clipflow -d clipflow -tA -c \
  "SELECT status FROM videos WHERE id = '$VIDEO_ID';"
echo

# ---- 3. Delete all ThumbnailGeneration rows for the video ----
echo "[3/5] Deleting ThumbnailGeneration rows for video…"
docker exec "$PG_CONTAINER" psql -U clipflow -d clipflow -v ON_ERROR_STOP=1 -q -c \
  "DELETE FROM thumbnail_generations WHERE \"videoId\" = '$VIDEO_ID';"
docker exec "$PG_CONTAINER" psql -U clipflow -d clipflow -tA -c \
  "SELECT COUNT(*) FROM thumbnail_generations WHERE \"videoId\" = '$VIDEO_ID';"
echo

# ---- 4. Purge stale BullMQ jobs so recovery can re-enqueue ----
echo "[4/5] Purging stale BullMQ thumbnails jobs for video…"
JOB_IDS=(
  "thumbnails-$VIDEO_ID"
  "recovery-thumbnails-$VIDEO_ID"
)
for jid in "${JOB_IDS[@]}"; do
  docker exec "$REDIS_CONTAINER" redis-cli DEL \
    "clipflow:thumbnails:$jid" >/dev/null
  docker exec "$REDIS_CONTAINER" redis-cli ZREM \
    "clipflow:thumbnails:completed" "$jid" >/dev/null
  docker exec "$REDIS_CONTAINER" redis-cli ZREM \
    "clipflow:thumbnails:failed" "$jid" >/dev/null
done
echo "  cleared: ${JOB_IDS[*]}"
echo

# ---- 5. Start worker; tail log ----
echo "[5/5] Starting worker; tailing $LOG_FILE (Ctrl-C to stop)…"
echo
cd "$ROOT_DIR"
: > "$LOG_FILE"
pnpm --filter worker dev >> "$LOG_FILE" 2>&1 &
WORKER_PID=$!
disown "$WORKER_PID" 2>/dev/null || true

# Wait briefly for boot, then tail.
sleep 8
tail -n +1 -F "$LOG_FILE"