import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "http://localhost:8000/openapi.json",
  output: {
    path: "src/api/generated",
    postProcess: ["prettier"],
  },
  plugins: ["@hey-api/typescript"],
});
