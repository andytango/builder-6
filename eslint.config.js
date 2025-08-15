import tseslint from '@typescript-eslint/eslint-plugin';
import jsdoc from 'eslint-plugin-jsdoc';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: ["dist/", "src/lib/agent-sessions/prisma/generated/", "src/lib/agent-sessions/prisma/generated/**/*.d.ts", "src/lib/agent-sessions/prisma/generated/**/*.js", "src/lib/database/prisma/generated/", "src/lib/database/prisma/generated/**/*"],
    files: ["src/**/*.ts", "!src/**/*.d.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: { 
      '@typescript-eslint': tseslint,
      jsdoc,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      'jsdoc/require-jsdoc': [
        'error',
        {
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: true,
            FunctionExpression: true,
          },
        },
      ],
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_.*_$',
          varsIgnorePattern: '^_.*_$',
          caughtErrors: 'none',
        },
      ],
    },
  },
];