#!/usr/bin/env bash
# 本机接口示例。默认 http://127.0.0.1:7341 ，可用 SAKURA_PET_URL 覆盖。
# 这些请求只改当前形态里的状态，不会换形态。
set -euo pipefail
BASE="${SAKURA_PET_URL:-http://127.0.0.1:7341}"

echo "health"
curl -sS "$BASE/health"
echo

echo "work-status → working"
curl -sS -X POST "$BASE/pet/work-status" \
  -H 'content-type: application/json' \
  -d '{"state":"working","task":"写一段说明"}'
echo

echo "same slot via the dsh-pet-shaped prefix"
curl -sS -X POST "$BASE/dsh-pet-7340/work-status" \
  -H 'content-type: application/json' \
  -d '{"state":"thinking","task":"对一下接口"}'
echo

echo "generic webhook"
curl -sS -X POST "$BASE/pet/events" \
  -H 'content-type: application/json' \
  -d '{"source":"webhook","event":"waiting","task":"等确认"}'
echo

echo "broadcast, duo split with ||"
curl -sS -X POST "$BASE/pet/broadcast" \
  -H 'content-type: application/json' \
  -d '{"text":"别怕。||……嗯。","durationMs":6000}'
echo

echo "state"
curl -sS "$BASE/pet/state"
echo
