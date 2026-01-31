import * as THREE from "three";
import { rendererConfig, cameraConfig } from "../config";

export default class SceneManager {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;

    constructor(canvas?: HTMLCanvasElement) {
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            logarithmicDepthBuffer: rendererConfig.logarithmicDepthBuffer,
            antialias: true,
        });
        // Ensure pixel-store flags are safe for 3D textures globally
        const gl = this.renderer.getContext();
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        this.renderer.setClearColor(rendererConfig.clearColor);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            cameraConfig.fov,
            cameraConfig.aspect,
            cameraConfig.near,
            cameraConfig.far
        );
    }

    setBackground(color: number | string): void {
        this.scene.background = new THREE.Color(color as THREE.ColorRepresentation);
    }

    add(obj: THREE.Object3D): void {
        this.scene.add(obj);
    }

    onResize(): void {
        const width = window.innerWidth;
        const height = window.innerHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(pixelRatio);
    }

    render(): void {
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.scene, this.camera);
    }
}
