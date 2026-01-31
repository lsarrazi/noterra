import * as THREE from "three";
import { CameraConfig, CameraObservable } from "../traits/CameraObservable";
import { GuiConfigurable } from "../traits/GuiConfigurable";
import { SpacetimeEntity } from "../spacetime/SpacetimeEntity";

type StarViewUniforms = {
    uTime: { value: number };
    uScale: { value: number };
    uCoreColor: { value: THREE.Color };
    uSurfaceColor: { value: THREE.Color };
    uSpotColor: { value: THREE.Color };
    uTurbulence: { value: number };
    uSpotDensity: { value: number };
    uSpotSharpness: { value: number };
    uEmissiveStrength: { value: number };
};

type GuiSchemaEntry = {
    key?: string;
    label?: string;
    type: "toggle" | "slider" | "color" | "folder";
    min?: number;
    max?: number;
    step?: number;
    get?: () => any;
    set?: (v: any) => void;
    schema?: GuiSchemaEntry[];
};

type GuiTab = { id: string; label: string; schema: GuiSchemaEntry[] };

type GuiTabs = { tabs: GuiTab[] };

export default class StarView implements
    CameraObservable,
    GuiConfigurable,
    SpacetimeEntity {
    uniforms: StarViewUniforms;
    mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
    group: THREE.Group;
    pointLight: THREE.PointLight;

    constructor(radius: number = 3) {
        const g = new THREE.SphereGeometry(radius, 128, 128);
        const m = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffaa44,
            emissiveIntensity: 2.0,
            roughness: 1.0,
            metalness: 0.0,
        });

        this.uniforms = {
            uTime: { value: 0 },
            uScale: { value: 3.0 },
            uCoreColor: { value: new THREE.Color(0xffffee) },
            uSurfaceColor: { value: new THREE.Color(0xffaa44) },
            uSpotColor: { value: new THREE.Color(0xff6622) },
            uTurbulence: { value: 0.4 },
            uSpotDensity: { value: 0.3 },
            uSpotSharpness: { value: 0.8 },
            uEmissiveStrength: { value: 2.5 },
        };

        m.onBeforeCompile = (shader: THREE.Shader) => {
            Object.assign(shader.uniforms, this.uniforms);

            shader.vertexShader = shader.vertexShader.replace(
                "varying vec3 vViewPosition;",
                "varying vec3 vViewPosition;\n  varying vec3 vObjectNormal;"
            );
            shader.vertexShader = shader.vertexShader.replace(
                "#include <defaultnormal_vertex>",
                `#include <defaultnormal_vertex>
          vObjectNormal = normalize(objectNormal);
        `
            );

            shader.fragmentShader =
                `
        uniform float uTime;
        uniform float uScale;
        uniform vec3 uCoreColor;
        uniform vec3 uSurfaceColor;
        uniform vec3 uSpotColor;
        uniform float uTurbulence;
        uniform float uSpotDensity;
        uniform float uSpotSharpness;
        uniform float uEmissiveStrength;

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
          for (int i = 0; i < 6; i++) {
            n += a;
            s += a * vnoise(p);
            p *= 2.03;
            a *= 0.5;
          }
          return s / max(n, 1e-4);
        }
      ` + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                "varying vec3 vViewPosition;",
                "varying vec3 vViewPosition;\n  varying vec3 vObjectNormal;"
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                "#include <emissivemap_fragment>",
                `#include <emissivemap_fragment>
          // Animated solar surface
          vec3 objN = normalize(vObjectNormal);
          vec3 p = objN * uScale;
          
          // Slow rotation for turbulence
          float timeScale = uTime * 0.05;
          vec3 pAnimated = p + vec3(sin(timeScale * 0.3), cos(timeScale * 0.2), sin(timeScale * 0.25)) * 0.2;
          
          // Base turbulence
          float turb = fbm(pAnimated + uTime * 0.1);
          
          // Solar spots (darker regions)
          float spots = fbm(pAnimated * 2.0 + uTime * 0.05);
          float spotMask = smoothstep(uSpotDensity, uSpotDensity + uSpotSharpness, spots);
          
          // Mix colors based on turbulence and spots
          vec3 surfaceColor = mix(uSurfaceColor, uCoreColor, turb * uTurbulence);
          surfaceColor = mix(uSpotColor, surfaceColor, spotMask);
          
          // Apply to emissive
          totalEmissiveRadiance = surfaceColor * uEmissiveStrength;
          
          // Also affect diffuse slightly
          diffuseColor.rgb = mix(diffuseColor.rgb, surfaceColor * 0.5, 0.3);
        `
            );
        };

        this.mesh = new THREE.Mesh(g, m);
        this.mesh.frustumCulled = false;

        // Add point light at center
        this.pointLight = new THREE.PointLight(0xffffcc, 1000, 200);
        this.pointLight.castShadow = true;

        this.group = new THREE.Group();
        this.group.add(this.mesh);
        this.group.add(this.pointLight);

        //this.group.add(new THREE.DirectionalLight(0xffffff, 5));
        //this.group.add(new THREE.AmbientLight(0x404040, 2));


        this.group.position.set(100, 100, 100);
    }

    getRestMass(): number { return 1.989e30; }

    getGravitySource() {
        return {
            kind: "point",
            mass: 1.989e10,
            epsilon: 0.5,
        } as const;
    }

    onSpacetimeTick(state: { time: number; tau: number; position: THREE.Vector3; velocity: THREE.Vector3; }): void {
        this.group.position.copy(state.position);
    }


    getCameraConfig(): CameraConfig {
        return {
            minDistance: 3,
            maxDistance: 10.0,
            radius: 3.0,
            type: 'trackball',
            getObjectRotation: () => new THREE.Quaternion(),
            getObjectPosition: () => this.group.position,
        }
    }

    update(time: number, dt = 0.016): void {
        if (this.uniforms?.uTime) {
            this.uniforms.uTime.value = time;
        }
    }

    render(time: number, camera: THREE.PerspectiveCamera) {

    }

    setScale(v: number): void {
        this.uniforms.uScale.value = v;
    }

    setCoreColor(hex: number | string): void {
        this.uniforms.uCoreColor.value.set(hex);
    }

    setSurfaceColor(hex: number | string): void {
        this.uniforms.uSurfaceColor.value.set(hex);
    }

    setSpotColor(hex: number | string): void {
        this.uniforms.uSpotColor.value.set(hex);
    }

    setTurbulence(v: number): void {
        this.uniforms.uTurbulence.value = v;
    }

    setSpotDensity(v: number): void {
        this.uniforms.uSpotDensity.value = v;
    }

    setSpotSharpness(v: number): void {
        this.uniforms.uSpotSharpness.value = v;
    }

    setEmissiveStrength(v: number): void {
        this.uniforms.uEmissiveStrength.value = v;
    }

    setLightIntensity(v: number): void {
        this.pointLight.intensity = v;
    }

    setLightColor(hex: number | string): void {
        this.pointLight.color.set(hex);
    }

    getGuiSchema(): GuiTabs {
        const appearance: GuiSchemaEntry[] = [
            {
                key: "scale",
                label: "Surface scale",
                type: "slider",
                min: 0.5,
                max: 10,
                step: 0.1,
                get: () => this.uniforms.uScale.value,
                set: (v: number) => this.setScale(v),
            },
            {
                key: "coreColor",
                label: "Core color",
                type: "color",
                get: () => `#${this.uniforms.uCoreColor.value.getHexString()}`,
                set: (v: string) => this.setCoreColor(v),
            },
            {
                key: "surfaceColor",
                label: "Surface color",
                type: "color",
                get: () => `#${this.uniforms.uSurfaceColor.value.getHexString()}`,
                set: (v: string) => this.setSurfaceColor(v),
            },
            {
                key: "spotColor",
                label: "Spot color",
                type: "color",
                get: () => `#${this.uniforms.uSpotColor.value.getHexString()}`,
                set: (v: string) => this.setSpotColor(v),
            },
            {
                key: "turbulence",
                label: "Turbulence",
                type: "slider",
                min: 0.0,
                max: 1.0,
                step: 0.01,
                get: () => this.uniforms.uTurbulence.value,
                set: (v: number) => this.setTurbulence(v),
            },
            {
                key: "spotDensity",
                label: "Spot density",
                type: "slider",
                min: 0.0,
                max: 1.0,
                step: 0.01,
                get: () => this.uniforms.uSpotDensity.value,
                set: (v: number) => this.setSpotDensity(v),
            },
            {
                key: "spotSharpness",
                label: "Spot sharpness",
                type: "slider",
                min: 0.0,
                max: 1.0,
                step: 0.01,
                get: () => this.uniforms.uSpotSharpness.value,
                set: (v: number) => this.setSpotSharpness(v),
            },
            {
                key: "emissiveStrength",
                label: "Emissive strength",
                type: "slider",
                min: 0.0,
                max: 10.0,
                step: 0.1,
                get: () => this.uniforms.uEmissiveStrength.value,
                set: (v: number) => this.setEmissiveStrength(v),
            },
        ];

        const lighting: GuiSchemaEntry[] = [
            {
                key: "lightIntensity",
                label: "Light intensity",
                type: "slider",
                min: 0.0,
                max: 10.0,
                step: 0.1,
                get: () => this.pointLight.intensity,
                set: (v: number) => this.setLightIntensity(v),
            },
            {
                key: "lightColor",
                label: "Light color",
                type: "color",
                get: () => `#${this.pointLight.color.getHexString()}`,
                set: (v: string) => this.setLightColor(v),
            },
        ];

        return {
            tabs: [
                { id: "appearance", label: "Appearance", schema: appearance },
                { id: "lighting", label: "Lighting", schema: lighting },
            ],
        };
    }
}
