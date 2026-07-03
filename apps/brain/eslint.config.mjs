import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // 25 `any` preexistentes en código legacy (loyalty, secciones Raíz,
      // mocks de tests). Warning, no error: el CI debe estar verde sin
      // refactorizar código congelado; los nuevos `any` se ven en el log.
      "@typescript-eslint/no-explicit-any": "warn",
      // Reglas nuevas del React Compiler (react-hooks v6, llegaron con Next 16):
      // señalan patrones legacy reales (setState síncrono en effects) en 6
      // secciones Raíz congeladas. Warning hasta que se refactoricen con el
      // backlog P3 (07_backlog_priorizado.md #19).
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
]);

export default eslintConfig;
