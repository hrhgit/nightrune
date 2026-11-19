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
);
