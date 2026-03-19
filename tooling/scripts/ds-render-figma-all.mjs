#!/usr/bin/env node

process.stderr.write(
  [
    '[DEPRECATED] `npm run ds:render-figma:all` is a deprecated compatibility wrapper.',
    'The canonical pipeline is now markdown-only: `npm run ds:pipeline`.',
    'If you need screenshots, run `npm run ds:capture-visual-proof` separately.',
    'See README.md migration notes for details.',
  ].join('\n') + '\n',
);

process.exit(0);
