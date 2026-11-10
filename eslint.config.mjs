import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', '**/dist/**', '**/.next/**', '**/.next-dev/**', '**/out/**', 'apps/desktop/release/**', 'apps/desktop/runtime/**', 'apps/mission-grid/next-env.d.ts', 'coverage/**', '.superpowers/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended
);
