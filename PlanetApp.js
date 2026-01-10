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

    this.cameraTrackingEnabled = true;
    this.cameraGuiState = null;

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

    const cameraFolder = gui.addFolder("Camera");
    const cameraState = {
      trackPlanet: this.cameraTrackingEnabled,
      latitude: 0,
      longitude: 0,
      planetLatitude: 0,
      planetLongitude: 0,
    };

    cameraFolder
      .add(cameraState, "trackPlanet")
      .name("Track planet")
      .onChange((v) => {
        this.cameraTrackingEnabled = !!v;
      });

    cameraFolder.add(cameraState, "latitude").name("Latitude (°)").listen();

    cameraFolder.add(cameraState, "longitude").name("Longitude (°)").listen();

    cameraFolder
      .add(cameraState, "planetLatitude")
      .name("Planet lat (°)")
      .listen();

    cameraFolder
      .add(cameraState, "planetLongitude")
      .name("Planet lon (°)")
      .listen();

    cameraFolder.open();
    this.cameraGuiState = cameraState;
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

    const prevRot = this.cameraTrackingEnabled
      ? this.planetSurface.currentRotation?.clone()
      : null;

    this.atmosphere.update(this.time);
    this.planetSurface.update(this.time, frameDt);

    const currRot = this.planetSurface.currentRotation;
    if (this.cameraTrackingEnabled && prevRot && currRot) {
      const deltaQ = currRot.clone().multiply(prevRot.clone().invert());
      this.orbit.applyRotationDelta(deltaQ);
    }

    this.orbit.update();
    this.#updateCameraLatLon();

    this.sceneManager.render();
  }

  #updateCameraLatLon() {
    if (!this.cameraGuiState) return;
    const R = planetSurfaceConfig.radius;
    const camera = this.sceneManager.camera;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.normalize();
    const origin = camera.position.clone();

    const a = dir.dot(dir); // should be 1
    const b = 2 * origin.dot(dir);
    const c = origin.dot(origin) - R * R;
    const disc = b * b - 4 * a * c;

    let hit = null;
    if (disc >= 0) {
      const sqrtDisc = Math.sqrt(disc);
      const t1 = (-b - sqrtDisc) / (2 * a);
      const t2 = (-b + sqrtDisc) / (2 * a);
      const t = t1 > 0 ? t1 : t2 > 0 ? t2 : null;
      if (t !== null) {
        hit = origin.clone().addScaledVector(dir, t);
      }
    }

    if (!hit) {
      hit = dir.clone().negate().normalize().multiplyScalar(R);
    }

    const latRad = Math.asin(THREE.MathUtils.clamp(hit.y / R, -1, 1));
    const lonRad = Math.atan2(hit.x, -hit.z);
    const lat = THREE.MathUtils.radToDeg(latRad);
    const lon = THREE.MathUtils.radToDeg(lonRad);

    this.cameraGuiState.latitude = Number(lat.toFixed(2));
    this.cameraGuiState.longitude = Number(lon.toFixed(2));

    // Planet-frame lat/lon: rotate hit point into planet local space
    const planetRot = this.planetSurface.currentRotation;
    if (planetRot) {
      const invRot = planetRot.clone().invert();
      const localHit = hit.clone().applyQuaternion(invRot);
      const platRad = Math.asin(THREE.MathUtils.clamp(localHit.y / R, -1, 1));
      const plonRad = Math.atan2(localHit.x, -localHit.z);
      const plat = THREE.MathUtils.radToDeg(platRad);
      const plon = THREE.MathUtils.radToDeg(plonRad);
      this.cameraGuiState.planetLatitude = Number(plat.toFixed(2));
      this.cameraGuiState.planetLongitude = Number(plon.toFixed(2));
    }
  }
}

PlanetApp._init();
