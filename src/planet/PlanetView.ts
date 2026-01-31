import * as THREE from "three";
import { planetSurfaceConfig } from "../config";
import Atmosphere from "../atmosphere/Atmosphere";
import { CameraObservable } from "../traits/CameraObservable";
import { GuiConfigurable } from "../traits/GuiConfigurable";
import { SpacetimeEntity } from "../spacetime/SpacetimeEntity";

type PlanetViewUniforms = {
    uTime: { value: number };
    uScale: { value: number };
    uSeaLevel: { value: number };
    uSeaColor: { value: THREE.Color };
    uLandLow: { value: THREE.Color };
    uLandHigh: { value: THREE.Color };
    uNormalStrength: { value: number };
    uDetailScale: { value: number };
    uDetailStrength: { value: number };
    uGridWidth: { value: number };
    uShowGrid: { value: number };
    uGridStrength: { value: number };
    uGridColor: { value: THREE.Color };
};

type GuiSchemaEntry = {
    key?: string;
    label?: string;
    type: "toggle" | "slider" | "color" | "folder";
    min?: number;
    max?: number;
    step?: number;
    options?: Array<{ value: number; text: string }>;
    get?: () => any;
    set?: (v: any) => void;
    schema?: GuiSchemaEntry[];
};

type GuiTab = { id: string; label: string; schema: GuiSchemaEntry[] };

type GuiTabs = { tabs: GuiTab[] };

export default class PlanetView implements GuiConfigurable, CameraObservable, SpacetimeEntity {
    axialTiltDeg: number;
    atmosphere: Atmosphere;
    cameraPrefs: { trackRotation: boolean; minDistance: number; maxDistance: number };
    uniforms: PlanetViewUniforms;
    baseGridWidth: number;
    mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
    axisHelper: THREE.Group;
    currentRotation: THREE.Quaternion;
    group: THREE.Group;

    constructor() {
        this.axialTiltDeg = planetSurfaceConfig.axialTilt;
        this.atmosphere = new Atmosphere();
        this.cameraPrefs = {
            trackRotation: true,
            minDistance: 0.50001,
            maxDistance: 5,
        };
        const g = new THREE.SphereGeometry(
            planetSurfaceConfig.radius,
            planetSurfaceConfig.segments,
            planetSurfaceConfig.segments
        );
        const m = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.85,
            metalness: 0.0,
        });

        this.uniforms = {
            uTime: { value: 0 },
            uScale: { value: planetSurfaceConfig.scale },
            uSeaLevel: { value: planetSurfaceConfig.seaLevel },
            uSeaColor: { value: new THREE.Color(planetSurfaceConfig.seaColor) },
            uLandLow: { value: new THREE.Color(planetSurfaceConfig.landLow) },
            uLandHigh: { value: new THREE.Color(planetSurfaceConfig.landHigh) },
            uNormalStrength: { value: planetSurfaceConfig.normalStrength },
            uDetailScale: { value: planetSurfaceConfig.detailScale },
            uDetailStrength: { value: planetSurfaceConfig.detailStrength },
            uGridWidth: { value: 0.02 },
            uShowGrid: { value: 0.0 },
            uGridStrength: { value: planetSurfaceConfig.gridStrength },
            uGridColor: { value: new THREE.Color(planetSurfaceConfig.gridColor) },
            uPlateCount: { value: 48 },
            uPlateSpeed: { value: 0.02 },
            uPlateContrast: { value: 0.3 },
        };

        this.baseGridWidth = 0.02;

        m.onBeforeCompile = (shader: THREE.Shader) => {
            Object.assign(shader.uniforms, this.uniforms);

            shader.vertexShader = shader.vertexShader.replace(
                "varying vec3 vViewPosition;",
                "varying vec3 vViewPosition;\n  varying vec3 vWorldNormal;\n  varying vec3 vObjectNormal;"
            );
            shader.vertexShader = shader.vertexShader.replace(
                "#include <defaultnormal_vertex>",
                `#include <defaultnormal_vertex>
          vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
          // Keep object-space normal to anchor procedural sampling to the planet
          vObjectNormal = normalize(objectNormal);
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
        uniform float uGridWidth;
        uniform float uShowGrid;
        uniform float uGridStrength;
        uniform vec3 uGridColor;

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
                "varying vec3 vViewPosition;\n  varying vec3 vWorldNormal;\n  varying vec3 vObjectNormal;"
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                "#include <color_fragment>",
                `#include <color_fragment>
          // Sample detail in object space so the pattern rides with the planet
          vec3 objN = normalize(vObjectNormal);
          vec3 p = objN * uScale;
          float hBase = fbm(p);
          float hDetail = fbm(p * uDetailScale);
          float shore = 1.0 - smoothstep(0.0, 0.025, abs(hBase - uSeaLevel));
          float h = clamp(hBase + uDetailStrength * shore * (hDetail - 0.5), 0.0, 1.0);
          float h2 = clamp(hBase + shore * 0.66 * (hDetail - 0.5), 0.0, 1.0);
          float m = smoothstep(uSeaLevel - 0.01, uSeaLevel + 0.01, h);
          vec3 land = mix(uLandLow, uLandHigh, smoothstep(0.5, 1.0, h2));
          vec3 nDetail = fbmNormal(p * uDetailScale);
          float landMask = step(0.6, m);
          vec3 n = normalize(vWorldNormal + nDetail * (uNormalStrength * landMask));
          float ndl = max(dot(n, normalize(vec3(0.4,0.6,0.7))), 0.0);
          float lightBoost = 0.6 + 0.4 * ndl;
          diffuseColor.rgb = mix(uSeaColor, land, m) * diffuseColor.rgb;

          // Grid overlay in object space (lat/long and prime meridian) for rotation cues
          float lat = asin(clamp(objN.y, -1.0, 1.0));
          float lon = atan(objN.x, -objN.z);
          float bands = 24.0; // finer grid (~15 degrees)
          float width = uGridWidth;
          float latLine = 1.0 - smoothstep(0.0, width, abs(sin(lat * bands)));
          float lonLine = 1.0 - smoothstep(0.0, width, abs(sin(lon * bands)));
          float prime = 1.0 - smoothstep(0.0, width * 0.5, abs(sin(lon)));
          float gridMask = clamp(max(max(latLine, lonLine), prime) * uShowGrid, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, uGridColor, gridMask * uGridStrength);

          diffuseColor.rgb *= lightBoost;
        `
            );
        };

        this.mesh = new THREE.Mesh(g, m);

        this.axisHelper = this.createAxisHelper();
        this.axisHelper.visible = false;

        this.currentRotation = new THREE.Quaternion();

        // Initialize spacetime state with default values
        this.spacetimeState = {
            time: 0,
            tau: 0,
            position: new THREE.Vector3(0, 0, 0),
            velocity: new THREE.Vector3(0, 0, 0),
        };

        this.group = new THREE.Group();
        this.group.add(this.atmosphere.volumeRenderer);
        this.group.add(this.mesh);
    }

    getRestMass(): number { return 5.972e24; }

    getGravitySource() {
        return {
            kind: "point",
            mass: 5.972,
            epsilon: 0.1,
        } as const;
    }

    setScale(v: number): void {
        this.uniforms.uScale.value = v;
    }

    setSeaLevel(v: number): void {
        this.uniforms.uSeaLevel.value = v;
    }

    setSeaColor(hex: number | string): void {
        this.uniforms.uSeaColor.value.set(hex);
    }

    setLandLow(hex: number | string): void {
        this.uniforms.uLandLow.value.set(hex);
    }

    setLandHigh(hex: number | string): void {
        this.uniforms.uLandHigh.value.set(hex);
    }

    setNormalStrength(v: number): void {
        this.uniforms.uNormalStrength.value = v;
    }

    setDetailScale(v: number): void {
        this.uniforms.uDetailScale.value = v;
    }

    setDetailStrength(v: number): void {
        this.uniforms.uDetailStrength.value = v;
    }

    setGridColor(hex: number | string): void {
        this.uniforms.uGridColor.value.set(hex);
    }

    setGridWidth(width: number): void {
        this.uniforms.uGridWidth.value = width;
    }

    updateGridWidthForCamera(camera: THREE.PerspectiveCamera, viewportHeight: number): void {
        if (!camera) return;
        const dist = camera.position.length();
        const radius = planetSurfaceConfig.radius;
        const scale = THREE.MathUtils.clamp(dist / (radius * 2.0), 0.2, 5.0);
        const width = this.baseGridWidth * scale;
        this.setGridWidth(width);
    }

    private spacetimeState: { time: number; tau: number; position: THREE.Vector3; velocity: THREE.Vector3; };

    onSpacetimeTick(state: { time: number; tau: number; position: THREE.Vector3; velocity: THREE.Vector3; }): void {
        //this.group.position.copy(state.position);
        this.spacetimeState = state;
    }

    update(time: number, dt = 0.016): void {
        if (this.uniforms?.uTime) {
            this.uniforms.uTime.value = time;
        }
        this.updateRotationAngle(time);
        this.group.position.copy(this.spacetimeState.position.clone().add(this.spacetimeState.velocity.clone().multiplyScalar(time - this.spacetimeState.time)));

    }

    render(time: number, camera: THREE.PerspectiveCamera) {
        this.atmosphere.render(time, camera, this.group.position, this.currentRotation);
    }

    updateRotationAngle(time: number): void {
        const rotQ = this.getRotationQuaternion(time);
        this.mesh.setRotationFromQuaternion(rotQ);
        this.axisHelper?.setRotationFromQuaternion(rotQ);
        this.currentRotation.copy(rotQ);
    }

    getRotationQuaternion(time: number): THREE.Quaternion {
        const SIDEREAL_DAY_S = 86164.0905 / 1000;
        const OMEGA = (2 * Math.PI) / SIDEREAL_DAY_S; // rad/s

        const angle = (OMEGA * time) % (2 * Math.PI);
        const tiltAngle = THREE.MathUtils.degToRad(this.axialTiltDeg);
        const axis = new THREE.Vector3(0, 1, 0);
        const spinQ = new THREE.Quaternion().setFromAxisAngle(axis, angle);
        const tiltQ = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 0, 1),
            tiltAngle
        );
        const rotQ = new THREE.Quaternion()
            .copy(spinQ)
            .multiplyQuaternions(tiltQ, spinQ)
            .normalize();

        return rotQ;
    }

    setAxialTilt(deg: number): void {
        this.axialTiltDeg = deg;
    }

    setGridVisible(visible: boolean): void {
        this.uniforms.uShowGrid.value = visible ? 1.0 : 0.0;
    }

    setGridStrength(value: number): void {
        this.uniforms.uGridStrength.value = value;
    }

    setAxisVisible(visible: boolean): void {
        this.axisHelper.visible = !!visible;
    }

    getGuiSchema(): GuiTabs {
        const helpersFolder: GuiSchemaEntry = {
            type: "folder",
            label: "Helpers",
            schema: [
                {
                    key: "grid",
                    label: "Show grid",
                    type: "toggle",
                    get: () => this.uniforms.uShowGrid.value > 0.5,
                    set: (v: boolean) => this.setGridVisible(v),
                },
                {
                    key: "axis",
                    label: "Show axis",
                    type: "toggle",
                    get: () => this.axisHelper.visible,
                    set: (v: boolean) => this.setAxisVisible(v),
                },
                {
                    key: "gridStrength",
                    label: "Grid strength",
                    type: "slider",
                    min: 0,
                    max: 1,
                    step: 0.01,
                    get: () => this.uniforms.uGridStrength.value,
                    set: (v: number) => this.setGridStrength(v),
                },
                {
                    key: "gridColor",
                    label: "Grid color",
                    type: "color",
                    get: () => `#${this.uniforms.uGridColor.value.getHexString()}`,
                    set: (v: string) => this.setGridColor(v),
                },
            ],
        };

        const general: GuiSchemaEntry[] = [
            {
                key: "scale",
                label: "Scale",
                type: "slider",
                min: 0.5,
                max: 20,
                step: 0.01,
                get: () => this.uniforms.uScale.value,
                set: (v: number) => this.setScale(v),
            },
            {
                key: "seaLevel",
                label: "Sea level",
                type: "slider",
                min: 0.0,
                max: 1.0,
                step: 0.001,
                get: () => this.uniforms.uSeaLevel.value,
                set: (v: number) => this.setSeaLevel(v),
            },
            {
                key: "seaColor",
                label: "Sea color",
                type: "color",
                get: () => `#${this.uniforms.uSeaColor.value.getHexString()}`,
                set: (v: string) => this.setSeaColor(v),
            },
            {
                key: "landLow",
                label: "Land low color",
                type: "color",
                get: () => `#${this.uniforms.uLandLow.value.getHexString()}`,
                set: (v: string) => this.setLandLow(v),
            },
            {
                key: "landHigh",
                label: "Land high color",
                type: "color",
                get: () => `#${this.uniforms.uLandHigh.value.getHexString()}`,
                set: (v: string) => this.setLandHigh(v),
            },
            {
                key: "normalStrength",
                label: "Normal strength",
                type: "slider",
                min: 0.0,
                max: 1.0,
                step: 0.01,
                get: () => this.uniforms.uNormalStrength.value,
                set: (v: number) => this.setNormalStrength(v),
            },
            {
                key: "detailScale",
                label: "Detail scale",
                type: "slider",
                min: 1.0,
                max: 40.0,
                step: 0.1,
                get: () => this.uniforms.uDetailScale.value,
                set: (v: number) => this.setDetailScale(v),
            },
            {
                key: "detailStrength",
                label: "Detail strength",
                type: "slider",
                min: 0,
                max: 20000,
                step: 10,
                get: () => this.uniforms.uDetailStrength.value,
                set: (v: number) => this.setDetailStrength(v),
            },
            {
                key: "axialTilt",
                label: "Axial tilt (°)",
                type: "slider",
                min: 0,
                max: 90,
                step: 0.01,
                get: () => this.axialTiltDeg,
                set: (v: number) => this.setAxialTilt(v),
            },
            helpersFolder,
        ];

        const cameraPanel: GuiSchemaEntry[] = [
            {
                key: "trackRotation",
                label: "Track rotation",
                type: "toggle",
                get: () => this.cameraPrefs.trackRotation,
                set: (v: boolean) => (this.cameraPrefs.trackRotation = !!v),
            },
            {
                key: "minDistance",
                label: "Min distance",
                type: "slider",
                min: 0.2,
                max: 2.0,
                step: 0.01,
                get: () => this.cameraPrefs.minDistance,
                set: (v: number) => (this.cameraPrefs.minDistance = v),
            },
            {
                key: "maxDistance",
                label: "Max distance",
                type: "slider",
                min: 2.0,
                max: 8.0,
                step: 0.01,
                get: () => this.cameraPrefs.maxDistance,
                set: (v: number) => (this.cameraPrefs.maxDistance = v),
            },
        ];

        return {
            tabs: [
                { id: "general", label: "General", schema: general },
                { id: "camera", label: "Camera", schema: cameraPanel },
                ...(this.atmosphere?.getGuiSchema?.()?.tabs ?? []),
            ],
        };
    }

    getCameraConfig() {
        return {
            type: "trackball",
            radius: planetSurfaceConfig.radius,
            minDistance: this.cameraPrefs.minDistance,
            maxDistance: this.cameraPrefs.maxDistance,
            trackRotation: this.cameraPrefs.trackRotation,
            getObjectRotation: () => this.currentRotation,
            getObjectPosition: () => this.group.position,
        } as const;
    }

    getAtmosphereObject(): THREE.Object3D | null {
        return (this.atmosphere as any)?.volumeRenderer ?? null;
    }

    private createAxisHelper(): THREE.Group {
        const g = new THREE.Group();
        const length = planetSurfaceConfig.radius * 3.0;
        const radius = planetSurfaceConfig.radius * 0.02;
        const thickness = 16;

        const mat = new THREE.MeshBasicMaterial({
            color: 0xffcc66,
            depthTest: false,
        });
        const cylGeom = new THREE.CylinderGeometry(
            radius,
            radius,
            length,
            thickness
        );
        const cyl = new THREE.Mesh(cylGeom, mat);
        g.add(cyl);

        const tipMat = new THREE.MeshBasicMaterial({
            color: 0xff8855,
            depthTest: false,
        });
        const tipGeom = new THREE.ConeGeometry(radius * 2.5, radius * 5, thickness);
        const tipNorth = new THREE.Mesh(tipGeom, tipMat);
        tipNorth.position.y = length * 0.5;
        g.add(tipNorth);

        const tipSouth = new THREE.Mesh(tipGeom, tipMat);
        tipSouth.rotation.x = Math.PI;
        tipSouth.position.y = -length * 0.5;
        g.add(tipSouth);

        g.renderOrder = 2;
        g.frustumCulled = false;

        return g;
    }
}
