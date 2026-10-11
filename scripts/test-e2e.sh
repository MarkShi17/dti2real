#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

compose() { docker compose -p "${DTI2IRL_TEST_PROJECT:-dti2irl-e2e}" -f compose.e2e.yaml "$@"; }
cleanup() { compose down --remove-orphans; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Separate project, disposable sessions, no host ports, and test-only credentials.
compose up --build --abort-on-container-exit --exit-code-from tests
