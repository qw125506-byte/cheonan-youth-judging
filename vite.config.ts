/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// --mode single 이면 인터넷·서버 없이 더블클릭으로 여는 단일 HTML 파일(dist-single/index.html)을 만든다.
export default defineConfig(({ mode }) => {
  const single = mode === 'single'
  return {
    base: './',
    plugins: [react(), tailwindcss(), ...(single ? [viteSingleFile()] : [])],
    build: { chunkSizeWarningLimit: 1500, ...(single ? { outDir: 'dist-single' } : {}) },
    test: { environment: 'node' },
  }
})
