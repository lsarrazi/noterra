import { defineConfig } from "vite";
import fs from "fs";
import path from "path";

const externalVolumes = ["VolumeRenderer.js", "VolumeSamplers.js"];

function emitExternalVolumes() {
    return {
        name: "emit-external-volumes",
        generateBundle() {
            for (const file of externalVolumes) {
                const src = path.resolve(__dirname, file);
                const code = fs.readFileSync(src);
                this.emitFile({ type: "asset", fileName: file, source: code });
            }
        },
    };
}

export default defineConfig({
    root: "./",
    publicDir: "three.js",
    build: {
        outDir: "dist",
        emptyOutDir: true,
        target: "esnext",
        // Bundle and minify (three will be minified by esbuild)
        minify: "esbuild",
        rollupOptions: {
            // Serve these from / (publicDir) instead of bundling
            external: (id) =>
                [
                    "/three.module.min.js",
                    "/three.core.min.js",
                    "/TrackballControls.js",
                    "/OrbitControls.js",
                    "/OBJLoader.js",
                    "/BufferGeometryUtils.js",
                ].includes(id) || externalVolumes.some((file) => id.includes(file)),
            plugins: [emitExternalVolumes()],
        },
    },
    server: {
        port: 5173,
    },
    // Use local three build; avoid pre-bundling
    optimizeDeps: {
        exclude: [
            "/three.module.min.js",
            "/three.core.min.js",
            "/TrackballControls.js",
            "/OrbitControls.js",
            "/OBJLoader.js",
            "/BufferGeometryUtils.js",
        ],
    },
});
