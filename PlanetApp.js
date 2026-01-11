import * as THREE from "./three.js/three.module.min.js";
import SceneManager from "./src/core/SceneManager.js";
import CameraRig from "./src/camera/CameraRig.js";
import PlanetView from "./src/planet/PlanetView.js";
import GuiManager from "./src/ui/GuiManager.js";
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
    this.guiManager = null;

    // Camera setup
    this.sceneManager.camera.position.z = 2;

    // Modules
    this.cameraRig = new CameraRig(
      this.sceneManager.camera,
      this.sceneManager.renderer.domElement
    );
    this.planetSurface = new PlanetView();

    this.objectsRegistry = [
      {
        id: "planet",
        label: "Planet",
        object: this.planetSurface,
        getGuiSchema: () => this.planetSurface.getGuiSchema(),
      },
      {
        id: "camera",
        label: "Camera",
        object: this.cameraRig,
        getGuiSchema: () => this.cameraRig.getGuiSchema(),
      },
    ];

    this.cameraRig.setObjectResolver((id) => {
      const entry = this.objectsRegistry.find((o) => o.id === id);
      return entry?.object ?? null;
    });
    this.cameraRig.setObservableById("planet");

    // Lights
    this.sceneManager.add(new THREE.DirectionalLight(0xffffff, 5));
    this.sceneManager.add(new THREE.AmbientLight(0x404040, 2));

    // Scene content
    const atmosphereObj = this.planetSurface.getAtmosphereObject();
    if (atmosphereObj) {
      this.sceneManager.add(atmosphereObj);
    }
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
    this.guiManager = new GuiManager();
    if (!this.guiManager.isReady()) return;

    this.guiManager.setGlobalsSchema([]);

    this.guiManager.setObjectsRegistry(this.objectsRegistry);
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
    this.cameraRig.updateZoom(this.sceneManager.camera, frameDt);
    this.cameraRig.updateRotateSpeed(this.sceneManager.camera);

    this.planetSurface.updateGridWidthForCamera(
      this.sceneManager.camera,
      this.sceneManager.renderer.domElement?.height ?? 1
    );
    this.planetSurface.update(this.time, frameDt);

    this.cameraRig.update(this.sceneManager.camera);
    this.guiManager?.refresh();

    this.sceneManager.render();
  }
}

PlanetApp._init();
