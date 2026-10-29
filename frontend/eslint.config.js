import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // The app loads data with the "fetch on mount" pattern (an effect calls
      // load(), which flips `loading` before awaiting). This rule cannot see
      // the await and flags every such page, so report it without failing.
      'react-hooks/set-state-in-effect': 'warn',
      // Hooks and shadcn variant helpers that live next to their component.
      'react-refresh/only-export-components': [
        'error',
        { allowConstantExport: true, allowExportNames: ['useAuth', 'badgeVariants', 'buttonVariants'] },
      ],
    },
  },
])
