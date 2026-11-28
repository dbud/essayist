#!/bin/sh
# Wrap comments in our package sources with parfit at width 100. Runs from the repo root via pnpm
# fmt:comments; machines without the parfit binary, including CI, run oxfmt alone. The first pass
# rewrites this file in place while sh still reads it: keep the file at parfit's canonical wrap.
command -v parfit >/dev/null 2>&1 || exit 0

# With file arguments, as from lint-staged, reflow those files alone.
if [ "$#" -gt 0 ]; then
  exec parfit -w 100 "$@" \
    --skip '^\s*//\s*oxlint-disable' \
    --skip '^\s*(?://|\*|#)\s*TODO\b' \
    --skip '^\s*(?://|\*|#)\s*parfit-ignore\s*$'
fi

# The -r walk respects .gitignore, so dist/, tmp/ and crates/*/pkg drop out of the roots unlisted.
# Verbatim: oxlint suppression lines, TODO lines so neighbouring comments don't merge into them, and
# parfit-ignore directives above blocks like the KV key layout tables.
parfit -w 100 \
  -r packages/core packages/worker packages/dbctl crates docs scripts \
  --include '*.{ts,tsx,js,jsx,rs,md,sh}' \
  --skip '^\s*//\s*oxlint-disable' \
  --skip '^\s*(?://|\*|#)\s*TODO\b' \
  --skip '^\s*(?://|\*|#)\s*parfit-ignore\s*$'

parfit -w 100 \
  vitest.config.ts DEVELOPMENT.md \
  --skip '^\s*(?://|\*|#)\s*parfit-ignore\s*$'

# No yaml language; the Shell spec reflows only # comment lines.
parfit -w 100 \
  -l sh \
  pnpm-workspace.yaml .github/*.yml .github/workflows/*.yml \
  --skip '^\s*(?://|\*|#)\s*parfit-ignore\s*$'
