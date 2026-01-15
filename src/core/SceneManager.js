import * as THREE from "/three.module.min.js";
import { rendererConfig, cameraConfig } from "../config/index.js";

export default class SceneManager {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      logarithmicDepthBuffer: rendererConfig.logarithmicDepthBuffer,
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

  setBackground(color) {
    this.scene.background = new THREE.Color(color);
  }

  add(obj) {
    this.scene.add(obj);
  }

  onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(pixelRatio);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
