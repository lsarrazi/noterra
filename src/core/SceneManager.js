import * as THREE from "../../three.js/three.module.min.js";
import { rendererConfig, cameraConfig } from "../config/index.js";

export default class SceneManager {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      logarithmicDepthBuffer: rendererConfig.logarithmicDepthBuffer,
    });
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
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
