import * as THREE from "../../three.js/three.module.min.js";
import VolumeRenderer from "../../VolumeRenderer.js";
import { atmosphereConfig } from "../config/index.js";

export default class Atmosphere {
  constructor() {
    this.volumeRenderer = new VolumeRenderer();
    const uniforms = this.volumeRenderer.uniforms;
    uniforms.volumeSize.value.set(2, 2, 2);
    uniforms.clipMin.value.set(-1, -1, -1);
    uniforms.clipMax.value.set(1, 1, 1);
    uniforms.valueAdded.value = 0;

    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 256, 0);
    gradient.addColorStop(0.0, "rgba(99, 183, 252, 0.5)");
    gradient.addColorStop(0.6, "rgba(42, 79, 109, 0.5)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 1)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 1);
    const paletteTexture = new THREE.CanvasTexture(canvas);

    uniforms.palette.value = paletteTexture;
    uniforms.extinctionMultiplier.value = atmosphereConfig.extinctionMultiplier;
    uniforms.alphaMultiplier.value = atmosphereConfig.alphaMultiplier;

    this.volumeRenderer.createAtlasTexture(
      new THREE.Vector3(2, 2, 2),
      new THREE.Vector3(-1, -1, -1),
      new THREE.Vector3(2, 2, 2),
      1
    );

    const planetFunction = `
vec3 p = vec3(x, y, z) - vec3(1.0);
float dist = length(p);
if (dist > 0.6) { return 0.0; }
if (dist < 0.5) { return 0.0; }
return 1.0 - smoothstep(0.4, 0.6, dist);
`;

    this.materialOptions = {
      customFunction: planetFunction,
      useDirectionalLights: true,
      invertNormals: true,
      raySteps: atmosphereConfig.raySteps,
      useExtinctionCoefficient: true,
      useValueAsExtinctionCoefficient: true,
      useRandomStart: true,
    };

    this.volumeRenderer.updateMaterial(this.materialOptions);
  }

  update(time) {
    this.volumeRenderer.uniforms.time.value = time;
    this.volumeRenderer.uniforms.random.value = Math.random();
  }

  setRaySteps(steps) {
    this.materialOptions.raySteps = Math.max(1, Math.floor(steps));
    this.volumeRenderer.updateMaterial(this.materialOptions);
  }

  setAlphaMultiplier(value) {
    this.volumeRenderer.uniforms.alphaMultiplier.value = value;
  }

  setExtinctionMultiplier(value) {
    this.volumeRenderer.uniforms.extinctionMultiplier.value = value;
  }

  getGuiSchema() {
    const schema = [
      {
        key: "raySteps",
        label: "Ray steps",
        type: "slider",
        min: 8,
        max: 256,
        step: 1,
        get: () => this.materialOptions.raySteps,
        set: (v) => this.setRaySteps(v),
      },
      {
        key: "alphaMultiplier",
        label: "Alpha gain",
        type: "slider",
        min: 0,
        max: 3,
        step: 0.05,
        get: () => this.volumeRenderer.uniforms.alphaMultiplier.value,
        set: (v) => this.setAlphaMultiplier(v),
      },
      {
        key: "extinctionMultiplier",
        label: "Extinction",
        type: "slider",
        min: 0,
        max: 5,
        step: 0.05,
        get: () => this.volumeRenderer.uniforms.extinctionMultiplier.value,
        set: (v) => this.setExtinctionMultiplier(v),
      },
    ];

    return {
      tabs: [
        {
          id: "atmosphere",
          label: "Atmosphere",
          schema,
        },
      ],
    };
  }
}
