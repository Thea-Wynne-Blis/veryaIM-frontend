import js from '@eslint/js'
import ts from 'typescript-eslint'
import vue from 'eslint-plugin-vue'

/**
 * 只保留能拦住真实问题的规则：
 * 未使用变量、未定义变量、Vue 模板语法错误、显式 any 警告。
 * 格式交给编辑器与 vue-tsc，不在 lint 里跟格式较劲。
 */
export default ts.config(
  {
    ignores: ['dist/**', 'deploy/**', 'docs/**', 'node_modules/**', 'tools/**', 'dev-dist/**'],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
        extraFileExtensions: ['.vue'],
      },
    },
  },
  {
    rules: {
      // 模板里大量使用多单词组件名/原生语义，不强求改名。
      'vue/multi-word-component-names': 'off',
      // 属性换行属于格式问题，交给编辑器。
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
)
