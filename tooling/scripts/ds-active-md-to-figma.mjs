#!/usr/bin/env node

process.stderr.write(
  [
    '[DEPRECATED] `npm run ds:active-md-to-figma` is a deprecated compatibility wrapper.',
    'Use `npm run ds:pipeline` (spec -> markdown) and',
    '`npm run ds:capture-visual-proof` as a standalone operation instead.',
    'See README.md migration notes for details.',
  ].join('\n') + '\n',
);

process.exit(0);
