#!/usr/bin/env bash
set -euo pipefail

# Find all TypeScript files in cinemas directory, sort and remove duplicates
files=$(find scripts/cinemas -type f -name '*.ts' | sort -u | jq -R -s -c 'split("\n")[:-1]')

# Create JSON array with name and path for each file
if ! json=$(echo "$files" | jq -c '[.[] | select(length > 0) | {
  name: (capture("(?<name>[^/]+)\\.ts$").name),
  path: (sub("^scripts/cinemas/"; ""))
}]'); then
    echo "Error: Failed to process JSON" >&2
fi

echo $json
