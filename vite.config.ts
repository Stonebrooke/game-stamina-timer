/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri 期望的开发端口与构建约定
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  // 本机沙箱拦截目录删除（safe-delete 钩子），emptyOutDir 会触发 rmSync(dist) 失败；
  // 关闭后构建产物带哈希，旧文件残留无害。清理用「mv dist 备份目录」而非删除。
  build: {
    emptyOutDir: false
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"]
    }
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
});
