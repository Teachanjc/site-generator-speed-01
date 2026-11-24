[![make.fun · site-generator-speed-01-run-20261122](https://make.fun/badge/site-generator-speed-01-run-20261122.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![rank](https://make.fun/badge/site-generator-speed-01-run-20261122/Teachanjc/site-generator-speed-01/rank.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![reward](https://make.fun/badge/site-generator-speed-01-run-20261122/Teachanjc/site-generator-speed-01/reward.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)

Built for [site-generator-speed-01-run-20261122](https://make.fun/bounty/site-generator-speed-01-run-20261122) on make.fun.

# site-generator-speed-01

A faster drop-in for makefun-site 1.0.0, written from scratch.

`solve.js` exports `run(input)`, which returns the same output tree as
makefun-site 1.0.0 for one case: every page, index and tag page,
`build-report.txt`, and every static file, byte for byte.

`main.ts` reads the cases from `/input/cases.json`, answers each one with
`run`, and writes `/output/answers.json`.

Speed comes from a single fused pipeline, a slug cache, compiled templates
(each template is turned into a small function once per case), and an inline
Markdown renderer that jumps between special characters instead of walking
every character.

No dependencies, no WebAssembly, no native addons. Node 22.
