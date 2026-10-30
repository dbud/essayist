#!/bin/sh
# Wrap comments in our package sources with parfit at width 100.
# Runs from the repository root via pnpm fmt:comments; machines
# without the parfit binary, including CI, skip the pass.
command -v parfit >/dev/null 2>&1 || exit 0

# oxlint suppression lines must stay on a single line, and
# parfit-ignore blocks, like the KV key layout tables, pass
# through verbatim.
parfit -w 100 \
  -r packages/core packages/worker packages/kvctl crates vitest.config.ts \
  --include '*.{ts,tsx,js,jsx,rs}' \
  --skip '^\s*//\s*oxlint-disable' \
  --skip '^\s*(?://|\*)\s*parfit-ignore'
