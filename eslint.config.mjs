import globals from 'globals';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  eslintPluginPrettierRecommended,
  {
    ignores: ['**/dist/']
  },
  {
    languageOptions: {
      globals: {
        ...globals.node
      },
      parserOptions: {
        projectService: true
      }
    }
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked
  },
  {
    rules: {
      // #region eslint
      // ----------------------------------------
      'constructor-super': 'error',
      curly: 'error',
      eqeqeq: ['error', 'smart'],
      'guard-for-in': 'error',
      'no-bitwise': 'error',
      'no-caller': 'error',
      'no-console': 'error',
      'no-constant-condition': ['error'],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-eval': 'error',
      'no-extra-bind': 'error',
      'no-fallthrough': 'error',
      'no-new-func': 'error',
      'no-new-wrappers': 'error',
      'no-restricted-globals': [
        'error',
        { name: 'setTimeout' },
        { name: 'clearTimeout' },
        { name: 'setInterval' },
        { name: 'clearInterval' },
        { name: 'setImmediate' },
        { name: 'clearImmediate' },
        // These globals don't exist outside of CJS files.
        { name: '__filename' },
        { name: '__dirname' },
        { name: 'require' },
        { name: 'module' },
        { name: 'exports' }
      ],
      'no-template-curly-in-string': 'error',
      'no-throw-literal': 'error',
      'no-undef-init': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'one-var': ['error', 'never'],
      'prefer-const': 'error',
      'prefer-object-spread': 'error',
      'unicode-bom': ['error', 'never'],
      radix: 'error',
      'sort-imports': [
        'error',
        {
          ignoreDeclarationSort: true
        }
      ],
      'spaced-comment': 'error',
      'use-isnan': 'error',
      // ----------------------------------------
      // #endregion

      // #region @typescript-eslint
      // ----------------------------------------
      '@typescript-eslint/member-ordering': [
        'error',
        {
          classes: {
            memberTypes: [
              // Index signature
              'signature',
              'call-signature',

              // Fields
              '#private-static-readonly-field',
              '#private-static-field',
              'private-static-readonly-field',
              'private-static-field',
              '#private-instance-readonly-field',
              '#private-instance-field',
              // "private-decorated-readonly-field",
              // "private-decorated-field",
              'private-instance-readonly-field',
              'private-instance-field',

              'protected-static-readonly-field',
              'protected-static-field',
              // "protected-decorated-readonly-field",
              // "protected-decorated-field",
              'protected-instance-readonly-field',
              'protected-instance-field',
              'protected-abstract-readonly-field',
              'protected-abstract-field',

              'public-static-readonly-field',
              'public-static-field',
              // "public-decorated-readonly-field",
              // "public-decorated-field",
              'public-instance-readonly-field',
              'public-instance-field',
              'public-abstract-readonly-field',
              'public-abstract-field',

              '#private-field',
              'private-field',
              'protected-field',
              'public-field',

              'static-readonly-field',
              'static-field',
              // "decorated-readonly-field",
              // "decorated-field",
              'instance-readonly-field',
              'instance-field',
              'abstract-readonly-field',
              'abstract-field',

              'readonly-field',
              'field',

              // Static initialization
              'static-initialization',

              // Constructors
              'public-constructor',
              'protected-constructor',
              'private-constructor',
              'constructor',

              // Accessors
              'public-static-accessor',
              'protected-static-accessor',
              'private-static-accessor',
              '#private-static-accessor',

              // "public-decorated-accessor",
              // "protected-decorated-accessor",
              // "private-decorated-accessor",

              'public-instance-accessor',
              'protected-instance-accessor',
              'private-instance-accessor',
              '#private-instance-accessor',

              'public-abstract-accessor',
              'protected-abstract-accessor',

              'public-accessor',
              'protected-accessor',
              'private-accessor',
              '#private-accessor',

              'static-accessor',
              // "decorated-accessor",
              'instance-accessor',
              'abstract-accessor',
              'accessor',

              // Getters
              'public-static-get',
              'protected-static-get',
              'private-static-get',
              '#private-static-get',

              // "public-decorated-get",
              // "protected-decorated-get",
              // "private-decorated-get",

              'public-instance-get',
              'protected-instance-get',
              'private-instance-get',
              '#private-instance-get',

              'public-abstract-get',
              'protected-abstract-get',

              'public-get',
              'protected-get',
              'private-get',
              '#private-get',

              'static-get',
              // "decorated-get",
              'instance-get',
              'abstract-get',
              'get',

              // Setters
              // "public-static-set",
              // "protected-static-set",
              // / "private-static-set",
              // "#private-static-set",

              // "public-decorated-set",
              // "protected-decorated-set",
              // "private-decorated-set",

              // "public-instance-set",
              // "protected-instance-set",
              // "private-instance-set",
              // "#private-instance-set",

              // "public-abstract-set",
              // "protected-abstract-set",

              // "public-set",
              // "protected-set",
              // "private-set",
              // "#private-set",

              // "static-set",
              // "decorated-set",
              // "instance-set",
              // "abstract-set",
              // "set",

              // Methods
              'public-static-method',
              'protected-static-method',
              'private-static-method',
              '#private-static-method',

              // "public-decorated-method",
              // "protected-decorated-method",
              // "private-decorated-method",

              'public-instance-method',
              'protected-instance-method',
              'private-instance-method',
              '#private-instance-method',

              'public-abstract-method',
              'protected-abstract-method',

              'public-method',
              'protected-method',
              'private-method',
              '#private-method',

              'static-method',
              // "decorated-method",
              'instance-method',
              'abstract-method',
              'method'
            ]
          }
        }
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'typeLike',
          format: ['PascalCase'],
          filter: { regex: '^(__String|[A-Za-z]+_[A-Za-z]+)$', match: false }
        },
        {
          selector: 'interface',
          format: ['PascalCase'],
          custom: { regex: '^I[A-Z]', match: false },
          filter: {
            regex: '^I(Arguments|TextWriter|O([A-Z][a-z]+[A-Za-z]*)?)$',
            match: false
          }
        },
        {
          selector: 'variable',
          format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
          filter: {
            regex: '^(_{1,2}filename|_{1,2}dirname|_+|[A-Za-z]+_[A-Za-z]+)$',
            match: false
          }
        },
        {
          selector: 'function',
          format: ['camelCase', 'PascalCase'],
          leadingUnderscore: 'allow',
          filter: { regex: '^[A-Za-z]+_[A-Za-z]+$', match: false }
        },
        {
          selector: 'parameter',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          filter: { regex: '^(_+|[A-Za-z]+_[A-Z][a-z]+)$', match: false }
        },
        {
          selector: 'method',
          format: ['camelCase', 'PascalCase'],
          leadingUnderscore: 'allow',
          filter: { regex: '^([0-9]+|[A-Za-z]+_[A-Za-z]+)$', match: false }
        },
        {
          selector: 'memberLike',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          filter: { regex: '^([0-9]+|[A-Za-z]+_[A-Za-z]+)$', match: false }
        },
        {
          selector: 'enumMember',
          format: ['camelCase', 'PascalCase'],
          leadingUnderscore: 'allow',
          filter: { regex: '^[A-Za-z]+_[A-Za-z]+$', match: false }
        },
        { selector: 'property', format: null }
      ],
      '@typescript-eslint/prefer-for-of': 'error',
      '@typescript-eslint/prefer-function-type': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      // ----------------------------------------
      // #endregion

      // #region prettier
      // ----------------------------------------
      'prettier/prettier': [
        'error',
        {
          printWidth: 120,
          tabWidth: 2,
          singleQuote: true,
          trailingComma: 'none',
          endOfLine: 'lf'
        },
        {
          usePrettierrc: false
        }
      ]
      // ----------------------------------------
      // #endregion
    }
  }
);
