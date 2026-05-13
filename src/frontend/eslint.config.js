import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-undef": "off",
      // F-CODE-11 / W-PRIMITIVES: raw fetch and direct localStorage of the
      // auth token must go through shared/tokenStore. Whitelisted files are
      // the wrappers themselves.
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='localStorage'][property.name=/^(getItem|setItem|removeItem)$/]",
          message: "Use shared/tokenStore instead of raw localStorage for the auth token (F-CODE-17).",
        },
      ],
    },
  },
  {
    files: ["src/shared/tokenStore.ts", "src/manage/ManageSidebar.tsx"],
    // ManageSidebar uses localStorage for the sidebar width — not auth.
    // tokenStore IS the wrapper.
    rules: { "no-restricted-syntax": "off" },
  },
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "src/api/generated.ts",
      "*.config.js",
      "*.config.ts",
    ],
  },
];
