import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [".next-local/**"]
  },
  ...nextCoreWebVitals,
  ...nextTypescript
];

export default eslintConfig;
