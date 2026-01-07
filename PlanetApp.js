import VolumeRenderer from "./VolumeRenderer.js";
import { OrbitControls } from "./three.js/OrbitControls.js";
import * as THREE from "./three.js/three.module.min.js";

export default class PlanetApp {
  static _init() {
    window.addEventListener("load", () => {
      new PlanetApp();
    });
  }

  constructor() {
    // Create the three.js renderer (COPIE DE App.js)
    this.renderer = new THREE.WebGLRenderer({
      canvas: document.querySelector("canvas"),
      logarithmicDepthBuffer: true,
    });

    // Create the main scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000020);

    // Create camera
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.00001, 10);
    this.camera.position.z = 2;

    // Camera controls
    this.orbitControls = new OrbitControls(
      this.camera,
      this.renderer.domElement
    );
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.08;
    this.orbitControls.minDistance = 0.50001;
    this.orbitControls.maxDistance = 5;
    this.orbitControls.enableZoom = false; // we'll handle smooth zoom manually
    this.baseRotateSpeed = 1.0;
    this.minRotateSpeed = 0; // slow when close to planet

    const minD = this.orbitControls.minDistance;
    const maxD = this.orbitControls.maxDistance;
    // Start from current distance
    this.zoomTargetDistance = this.camera.position.distanceTo(
      this.orbitControls.target
    );

    const onWheel = (event) => {
      event.preventDefault();
      const delta = event.deltaY;
      // Work in offset-from-min distance and scale multiplicatively for smoothness.
      const current = this.zoomTargetDistance ?? maxD;
      let offset = Math.max(0, current - minD);
      if (delta < 0) {
        // zoom in
        offset *= 0.95;
      } else if (delta > 0) {
        // zoom out
        offset /= 0.95;
      }
      offset = THREE.MathUtils.clamp(offset, 0, maxD - minD);
      this.zoomTargetDistance = minD + offset;
    };

    this.renderer.domElement.addEventListener("wheel", onWheel, {
      passive: false,
    });
    window.addEventListener("wheel", onWheel, { passive: false });

    // Create volume renderer (EXACTEMENT COMME App.js)
    this.volumeRenderer = new VolumeRenderer();
    this.scene.add(this.volumeRenderer);

    // Create planet mesh (solid sphere) with procedural oceans
    const planetGeometry = new THREE.SphereGeometry(0.5, 192, 192);
    const planetMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.0,
    });

    // Seamless procedural colors in shader (no UV seam)
    this.planetShaderUniforms = {
      uTime: { value: 0 },
      uScale: { value: 6.0 },
      uSeaLevel: { value: 0.48 },
      uSeaColor: { value: new THREE.Color(0x2a5d9a) },
      uLandLow: { value: new THREE.Color(0x2f6a3a) },
      uLandHigh: { value: new THREE.Color(0x9c8a5a) },
      uNormalStrength: { value: 0.12 },
      uDetailScale: { value: 22.0 },
      uDetailStrength: { value: 10000 },
    };

    planetMaterial.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.planetShaderUniforms);

      // Add world-space normal varying
      shader.vertexShader = shader.vertexShader.replace(
        "varying vec3 vViewPosition;",
        "varying vec3 vViewPosition;\n  varying vec3 vWorldNormal;"
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <defaultnormal_vertex>",
        `#include <defaultnormal_vertex>
          vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
        `
      );

      shader.fragmentShader =
        `
        uniform float uTime;
        uniform float uScale;
        uniform float uSeaLevel;
        uniform vec3 uSeaColor;
        uniform vec3 uLandLow;
        uniform vec3 uLandHigh;
        uniform float uNormalStrength;
        uniform float uDetailScale;
        uniform float uDetailStrength;

        // 3D value noise
        float hash31(vec3 p) {
          p = fract(p * 0.3183099 + vec3(0.1,0.2,0.3));
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }
        float vnoise(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          vec3 u = f * f * (3.0 - 2.0 * f);
          float n000 = hash31(i + vec3(0,0,0));
          float n100 = hash31(i + vec3(1,0,0));
          float n010 = hash31(i + vec3(0,1,0));
          float n110 = hash31(i + vec3(1,1,0));
          float n001 = hash31(i + vec3(0,0,1));
          float n101 = hash31(i + vec3(1,0,1));
          float n011 = hash31(i + vec3(0,1,1));
          float n111 = hash31(i + vec3(1,1,1));
          float nx00 = mix(n000, n100, u.x);
          float nx10 = mix(n010, n110, u.x);
          float nx01 = mix(n001, n101, u.x);
          float nx11 = mix(n011, n111, u.x);
          float nxy0 = mix(nx00, nx10, u.y);
          float nxy1 = mix(nx01, nx11, u.y);
          return mix(nxy0, nxy1, u.z);
        }
        float fbm(vec3 p) {
          float a = 0.5;
          float s = 0.0;
          float n = 0.0;
          for (int i = 0; i < 10; i++) {
            n += a;
            s += a * vnoise(p);
            p *= 2.01;
            a *= 0.5;
          }
          return s / max(n, 1e-4);
        }

        vec3 fbmNormal(vec3 p) {
          // Finite differences for a pseudo-normal from fbm field
          float e = 0.02;
          float c = fbm(p);
          float dx = fbm(p + vec3(e, 0.0, 0.0)) - c;
          float dy = fbm(p + vec3(0.0, e, 0.0)) - c;
          float dz = fbm(p + vec3(0.0, 0.0, e)) - c;
          return normalize(vec3(dx, dy, dz));
        }
      ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        "varying vec3 vViewPosition;",
        "varying vec3 vViewPosition;\n  varying vec3 vWorldNormal;"
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
          vec3 p = normalize(vWorldNormal) * uScale ;
          float hBase = fbm(p);
          float hDetail = fbm(p * uDetailScale);
          // Apply detail mainly near shorelines
          float shore = 1.0 - smoothstep(0.0, 0.025, abs(hBase - uSeaLevel));
          float h = clamp(hBase + uDetailStrength * shore * (hDetail - 0.5), 0.0, 1.0);
          float h2 = clamp(hBase + shore * 0.66 * (hDetail - 0.5), 0.0, 1.0);
          float m = smoothstep(uSeaLevel - 0.01, uSeaLevel + 0.01, h);
          vec3 land = mix(uLandLow, uLandHigh, smoothstep(0.5, 1.0, h2));
          // Perturb normal for extra micro-detail without adding triangles
          vec3 nDetail = fbmNormal(p * uDetailScale);
          float landMask = step(0.6, m); // hard cut for land normals
          vec3 n = normalize(vWorldNormal + nDetail * (uNormalStrength * landMask));
          // Simple Lambertian boost based on perturbed normal
          float ndl = max(dot(n, normalize(vec3(0.4,0.6,0.7))), 0.0);
          float lightBoost = 0.6 + 0.4 * ndl;
          diffuseColor.rgb = mix(uSeaColor, land, m) * diffuseColor.rgb;
          diffuseColor.rgb *= lightBoost;
        `
      );
    };

    this.planetMesh = new THREE.Mesh(planetGeometry, planetMaterial);
    this.scene.add(this.planetMesh);

    // Add light for the planet
    const light = new THREE.DirectionalLight(0xffffff, 5);
    //light.position.set(2, 2, 2);
    this.scene.add(light);

    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    this.scene.add(ambientLight);

    const uniforms = this.volumeRenderer.uniforms;
    uniforms.volumeSize.value.set(2, 2, 2);
    uniforms.clipMin.value.set(-1, -1, -1);
    uniforms.clipMax.value.set(1, 1, 1);
    uniforms.valueAdded.value = 0;
    this.volumeRenderer.createAtlasTexture(
      new THREE.Vector3(2, 2, 2),
      new THREE.Vector3(-1, -1, -1),
      new THREE.Vector3(2, 2, 2),
      1
    );

    // Setup planet
    this.createPlanet();

    // Handle window resize
    window.addEventListener("resize", () => this.handleResize());
    this.handleResize();

    // Start animation
    this.lastTime = null;
    this.time = 0;
    this.animate();
  }

  createPlanet() {
    // Fonction planète avec atmosphère
    const planetFunction = `

vec3 p = vec3(x, y, z) - vec3(1.0);
float dist = length(p);

if (dist > 0.6) {
    return 0.0;
  }

  if (dist < 0.5) {
    return 0.0;
  }

return 1.0 - smoothstep(0.4, 0.6, dist);
`;

    // Create palette (bleu pour atmosphère, vert pour planète)
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

    const uniforms = this.volumeRenderer.uniforms;
    uniforms.palette.value = paletteTexture;
    uniforms.extinctionMultiplier.value = 1.0;
    uniforms.alphaMultiplier.value = 1.0;

    this.volumeRenderer.updateMaterial({
      customFunction: planetFunction,
      useDirectionalLights: true,
      invertNormals: true,
      raySteps: 64,
      useExtinctionCoefficient: true,
      useValueAsExtinctionCoefficient: true,
      useRandomStart: true,
    });

    // Setup GUI
    const gui = new lil.GUI();
    const renderFolder = gui.addFolder("Rendering");
    renderFolder
      .add(uniforms.alphaMultiplier, "value", 0, 5, 0.1)
      .name("Alpha");
    renderFolder
      .add(uniforms.extinctionMultiplier, "value", 0, 5, 0.1)
      .name("Extinction");
    renderFolder.open();
  }

  // Simple value-noise based color texture for oceans/land
  createNoiseTexture(
    width,
    height,
    { octaves = 4, persistence = 0.5, scale = 2.5, seaLevel = 0.45 } = {}
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(width, height);

    const rand = () => Math.random();
    const gradients = [];
    const gridW = Math.max(2, Math.floor(width / 8));
    const gridH = Math.max(2, Math.floor(height / 8));
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        const a = rand() * Math.PI * 2;
        gradients.push({ x: Math.cos(a), y: Math.sin(a) });
      }
    }
    const wrap = (v, m) => {
      v %= m;
      return v < 0 ? v + m : v;
    };
    const grad = (x, y) => gradients[wrap(y, gridH) * gridW + wrap(x, gridW)];
    const dotGridGrad = (ix, iy, x, y) => {
      const g = grad(ix, iy);
      const dx = x - ix;
      const dy = y - iy;
      return dx * g.x + dy * g.y;
    };
    const smoothstep = (t) => t * t * (3 - 2 * t);
    const noise2d = (x, y) => {
      const x0 = Math.floor(x);
      const x1 = x0 + 1;
      const y0 = Math.floor(y);
      const y1 = y0 + 1;
      const sx = smoothstep(x - x0);
      const sy = smoothstep(y - y0);
      const n0 = dotGridGrad(x0, y0, x, y);
      const n1 = dotGridGrad(x1, y0, x, y);
      const ix0 = n0 + sx * (n1 - n0);
      const n2 = dotGridGrad(x0, y1, x, y);
      const n3 = dotGridGrad(x1, y1, x, y);
      const ix1 = n2 + sx * (n3 - n2);
      return ix0 + sy * (ix1 - ix0);
    };

    const sample = (u, v) => {
      let amp = 1;
      let freq = scale;
      let sum = 0;
      let norm = 0;
      for (let o = 0; o < octaves; o++) {
        // wrap coordinates to keep noise tileable
        const px = (u * freq) % gridW;
        const py = (v * freq) % gridH;
        sum += noise2d(px, py) * amp;
        norm += amp;
        amp *= persistence;
        freq *= 2;
      }
      return 0.5 + 0.5 * (sum / norm);
    };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const u = x / width;
        const v = y / height;
        const n = sample(u, v);
        const isSea = n < seaLevel;
        const t = isSea ? n / seaLevel : (n - seaLevel) / (1 - seaLevel);
        const r = isSea ? 20 + 40 * t : 40 + 60 * t;
        const g = isSea ? 70 + 100 * t : 90 + 90 * t;
        const b = isSea ? 140 + 90 * t : 60 + 40 * t;
        const a = 255;
        const idx = (y * width + x) * 4;
        img.data[idx] = r;
        img.data[idx + 1] = g;
        img.data[idx + 2] = b;
        img.data[idx + 3] = a;
      }
    }

    // Explicitly copy first column to last to guarantee horizontal seamlessness
    for (let y = 0; y < height; y++) {
      const idx0 = (y * width + 0) * 4;
      const idx1 = (y * width + (width - 1)) * 4;
      img.data[idx1] = img.data[idx0];
      img.data[idx1 + 1] = img.data[idx0 + 1];
      img.data[idx1 + 2] = img.data[idx0 + 2];
      img.data[idx1 + 3] = img.data[idx0 + 3];
    }

    ctx.putImageData(img, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy?.() ?? 1;
    texture.needsUpdate = true;
    return texture;
  }

  handleResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
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

    // Smooth zoom toward target distance with exponential decay; never cross min distance.
    if (this.zoomTargetDistance !== undefined) {
      const target = this.orbitControls.target;
      const dir = this.camera.position.clone().sub(target);
      const currentDist = dir.length();
      const minDist = this.orbitControls.minDistance;
      if (currentDist > 0 && this.zoomTargetDistance > 0) {
        const offset = Math.max(0, currentDist - minDist);
        const targetOffset = Math.max(0, this.zoomTargetDistance - minDist);
        const k = 6.0; // higher = faster convergence
        const dt = Math.max(0, frameDt);
        // h = h_min + (h - h_min) * exp(-k * dt) toward target offset
        const nextOffset =
          targetOffset + (offset - targetOffset) * Math.exp(-k * dt);
        const nextDist = minDist + nextOffset;
        dir.normalize().multiplyScalar(nextDist);
        this.camera.position.copy(target).add(dir);
      }
    }

    // Scale rotation speed based on zoom distance: slower when near min, normal when far.
    {
      const target = this.orbitControls.target;
      const dist = this.camera.position.distanceTo(target);
      const span = Math.max(
        1e-6,
        this.orbitControls.maxDistance - this.orbitControls.minDistance
      );
      const t = THREE.MathUtils.clamp(
        (dist - this.orbitControls.minDistance) / span,
        0,
        1
      );
      const eased = Math.pow(t, 0.75); // ease so slowdown kicks in near planet
      this.orbitControls.rotateSpeed = THREE.MathUtils.lerp(
        this.minRotateSpeed,
        this.baseRotateSpeed,
        eased
      );
    }

    // Update controls (rotation, damping) using the new camera position
    this.orbitControls.update();

    // Update volume uniforms
    this.volumeRenderer.uniforms.time.value = this.time;
    this.volumeRenderer.uniforms.random.value = Math.random();

    // Update planet shader time
    if (this.planetShaderUniforms) {
      this.planetShaderUniforms.uTime.value = 0; // keep pattern static
    }

    // Rotate planet mesh for visible surface motion
    /*this.planetMesh.rotation.y +=
      0.1 * ((now - (this.lastRotTime ?? now)) / 1000 || 0);
    this.lastRotTime = now;
*/
    // Render
    this.renderer.render(this.scene, this.camera);
  }
}

PlanetApp._init();
