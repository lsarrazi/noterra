import * as THREE from "./three.js/three.module.min.js";
import SceneManager from "./src/core/SceneManager.js";
import OrbitController from "./src/core/OrbitController.js";
import PlanetSurface from "./src/planet/PlanetSurface.js";
import Atmosphere from "./src/atmosphere/Atmosphere.js";
import { planetSurfaceConfig } from "./src/config/index.js";

export default class PlanetApp {
  static _init() {
    window.addEventListener("load", () => {
      new PlanetApp();
    });
  }

  constructor() {
    const canvas = document.querySelector("canvas");
    this.sceneManager = new SceneManager(canvas);
    this.sceneManager.setBackground(0x000020);

    // Camera setup
    this.sceneManager.camera.position.z = 2;

    // Modules
    this.orbit = new OrbitController(
      this.sceneManager.camera,
      this.sceneManager.renderer.domElement
    );
    this.atmosphere = new Atmosphere();
    this.planetSurface = new PlanetSurface();

    // Lights
    this.sceneManager.add(new THREE.DirectionalLight(0xffffff, 5));
    this.sceneManager.add(new THREE.AmbientLight(0x404040, 2));

    // Scene content
    this.sceneManager.add(this.atmosphere.volumeRenderer);
    this.sceneManager.add(this.planetSurface.group);
    this.sceneManager.add(this.planetSurface.axisHelper);

    window.addEventListener("resize", () => this.handleResize());
    this.handleResize();

    this.#setupGui();

    this.lastTime = null;
    this.time = 0;
    this.animate();
  }

  #setupGui() {
    if (!window.lil || !window.lil.GUI) return;
    const gui = new window.lil.GUI();
    const indicators = gui.addFolder("Indicators");
    const state = {
      grid: false,
      axis: false,
      gridStrength: this.planetSurface.uniforms.uGridStrength.value,
    };

    indicators
      .add(state, "grid")
      .name("Show grid")
      .onChange((v) => this.planetSurface.setGridVisible(v));

    indicators
      .add(state, "axis")
      .name("Show axis")
      .onChange((v) => this.planetSurface.setAxisVisible(v));

    indicators
      .add(state, "gridStrength", 0, 1, 0.01)
      .name("Grid strength")
      .onChange((v) => this.planetSurface.setGridStrength(v));

    indicators.open();

    const planet = gui.addFolder("Planet");

    const planetState = {
      axialTilt: planetSurfaceConfig.axialTilt,
    };

    planet
      .add(planetState, "axialTilt", 0, 90, 0.01)
      .name("Axial tilt (°)")
      .onChange((v) => {
        planetSurfaceConfig.axialTilt = v;
      });

    planet.open();
  }

  handleResize() {
    this.sceneManager.onResize();
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const now = performance.now();
    let frameDt = 0;
    if (this.lastTime !== null) {
      frameDt = (now - this.lastTime) / 1000;
      this.time += frameDt;
    }
    this.lastTime = now;

    // Updates
    this.orbit.updateZoom(this.sceneManager.camera, frameDt);
    this.orbit.updateRotateSpeed(this.sceneManager.camera);

    const prevRot = this.planetSurface.currentRotation?.clone();

    this.atmosphere.update(this.time);
    this.planetSurface.update(this.time, frameDt);

    const currRot = this.planetSurface.currentRotation;
    if (prevRot && currRot) {
      const deltaQ = currRot.clone().multiply(prevRot.clone().invert());
      this.orbit.applyRotationDelta(deltaQ);
    }

    this.orbit.update();

    this.sceneManager.render();
  }
}

PlanetApp._init();
