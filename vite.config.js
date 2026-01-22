const { defineConfig } = require('vite')
const path = require('path')

module.exports = defineConfig({
    root: '.',
    base: './', // Important for Electron relative paths in build
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
    server: {
        port: 5173,
        strictPort: true,
    }
})
