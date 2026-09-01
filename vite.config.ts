import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { sites } from "@openai/sites-vite-plugin";

export default defineConfig({
  plugins: [react(), sites(), cloudflare({ viteEnvironment: { name: "server" } })],
});
