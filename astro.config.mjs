import { defineConfig } from "astro/config";
import { studioIntegration, archiveMarkdown } from "./studio/server.mjs";

const base = process.env.AFTERIMAGE_BASE || "/";
export default defineConfig({
  site: "https://luciannna-na.github.io",
  base,
  output: "static",
  server: { host: "127.0.0.1" },
  integrations: [studioIntegration()],
  markdown: { remarkPlugins: [archiveMarkdown(base)] },
});
