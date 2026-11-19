// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Engine purity: randomness only from the seed (R-16), no clock, no I/O, no UI.
    files: ['engine/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Engine randomness must come from the seeded RNG in state (R-16).' },
        { object: 'Date', property: 'now', message: 'The engine must not read the clock.' },
        { object: 'performance', property: 'now', message: 'The engine must not read the clock.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: 'The engine must not read the clock.' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'The engine must not touch the UI.' },
        { name: 'document', message: 'The engine must not touch the UI.' },
        { name: 'fetch', message: 'The engine must not do I/O.' },
        { name: 'process', message: 'The engine must not read the environment.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*'], message: 'The engine must not import Node built-ins.' },
            { group: ['../cli/*', '../web/*', '../factory/*'], message: 'The engine must not depend on cli/web/factory.' },
          ],
        },
      ],
    },
  },
  {
    // UI and text code show engine state; they must not compute rules. They reach the rules only
    // through the engine's public entry point and never read the rule or enemy tables directly.
    files: ['web/**/*.ts', 'present/**/*.ts', 'cli/**/*.ts', 'bots/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/data/*', '**/engine/*', '!**/engine/index.ts'],
              message: 'Use the engine public API (engine/index.ts); UI, text, CLI and bots must not read data tables or engine internals.',
            },
          ],
        },
      ],
    },
  },
  {
    // Visual randomness comes from the battle seed so the same seed always looks the same.
    files: ['web/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Visual randomness must come from the battle seed.' },
      ],
    },
  },
);
