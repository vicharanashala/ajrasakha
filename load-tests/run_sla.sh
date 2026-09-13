#!/bin/bash
# SLA test matrix: run each scenario at 1x / 5x / 10x load, CSV output to results/.
#
# Baseline (1x) per the Project 7 brief:
#   login:     50 concurrent experts
#   questions: 100 questions entering the pipeline
#   reviews:   10 concurrent full review cycles
#
# Usage: ./run_sla.sh [duration per run, default 2m]
set -e
cd "$(dirname "$0")"
DUR="${1:-2m}"
mkdir -p results

run() { # user_class users spawn_rate label
  echo "=== $1 @ $4 ($2 users) ==="
  locust -f locustfile.py "$1" --headless -u "$2" -r "$3" -t "$DUR" \
    --csv "results/${1}_${4}" --only-summary
}

# login scenario: 1x=50, 5x=250, 10x=500
run ExpertLoginUser 50 10 1x
run ExpertLoginUser 250 25 5x
run ExpertLoginUser 500 50 10x

# question ingestion: 1x=10 creators (~100 questions in 2m), 5x, 10x
run QuestionCreatorUser 10 5 1x
run QuestionCreatorUser 50 10 5x
run QuestionCreatorUser 100 20 10x

# full review pipeline: 1x=10 concurrent cycles, 5x, 10x
run ReviewPipelineUser 10 5 1x
run ReviewPipelineUser 50 10 5x
run ReviewPipelineUser 100 20 10x

echo "All runs complete. CSVs in results/"
