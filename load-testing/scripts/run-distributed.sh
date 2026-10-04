#!/usr/bin/env bash
# Runs one slice of a distributed k6 test with execution segments.
#
# Start the same command at the same time on N load generators, each with its own INDEX:
#
#   generator 1:  ./run-distributed.sh 0 4 spike https://bpms-test.example.internal
#   generator 2:  ./run-distributed.sh 1 4 spike https://bpms-test.example.internal
#   ...
#
# k6 then splits every scenario (VUs, arrival rates) into N equal parts, and exec.vu.idInTest
# stays unique across generators, so each virtual user still gets its own test account.
# Results land in ./results; merge the CSV files or point all generators at one
# Prometheus or InfluxDB instance for a combined view.

set -euo pipefail

INDEX="${1:?usage: run-distributed.sh INDEX TOTAL [PROFILE] [BASE_URL]}"
TOTAL="${2:?usage: run-distributed.sh INDEX TOTAL [PROFILE] [BASE_URL]}"
PROFILE="${3:-spike}"
BASE_URL="${4:-http://localhost:8080}"

if (( INDEX < 0 || INDEX >= TOTAL )); then
  echo "INDEX must be between 0 and TOTAL-1" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K6_DIR="${SCRIPT_DIR}/../k6"
RESULTS_DIR="${RESULTS_DIR:-${SCRIPT_DIR}/../results}"
mkdir -p "${RESULTS_DIR}"

# Segment boundaries: 0, 1/N, 2/N, ..., 1
parts=("0")
for (( i = 1; i < TOTAL; i++ )); do parts+=("${i}/${TOTAL}"); done
parts+=("1")
SEQUENCE="$(IFS=,; echo "${parts[*]}")"
FROM="${parts[$INDEX]}"
TO="${parts[$((INDEX + 1))]}"

echo "generator ${INDEX}/${TOTAL}: profile=${PROFILE} segment=${FROM}:${TO} target=${BASE_URL}"

k6 run \
  --no-usage-report \
  --execution-segment "${FROM}:${TO}" \
  --execution-segment-sequence "${SEQUENCE}" \
  --summary-export "${RESULTS_DIR}/${PROFILE}-gen${INDEX}-summary.json" \
  --out "csv=${RESULTS_DIR}/${PROFILE}-gen${INDEX}.csv.gz" \
  -e PROFILE="${PROFILE}" \
  -e BASE_URL="${BASE_URL}" \
  "${K6_DIR}/main.js"
