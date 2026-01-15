import * as THREE from "three";
import VolumeRenderer from "../../VolumeRenderer";
import { atmosphereConfig } from "../config";

type AtmosphereMaterialOptions = {
    customFunction: string;
    useDirectionalLights: boolean;
    invertNormals: boolean;
    raySteps: number;
    useExtinctionCoefficient: boolean;
    useValueAsExtinctionCoefficient: boolean;
    useRandomStart: boolean;
};

type AtmosphereGuiSchema = {
    tabs: Array<{
        id: string;
        label: string;
        schema: Array<{
            key: string;
            label: string;
            type: "slider";
            min: number;
            max: number;
            step: number;
            get: () => number;
            set: (v: number) => void;
        }>;
    }>;
};

export default class Atmosphere {
    volumeRenderer: any;
    materialOptions: AtmosphereMaterialOptions;

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
        if (!ctx) throw new Error("Failed to get 2D context for atmosphere palette");
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

    update(time: number): void {
        this.volumeRenderer.uniforms.time.value = time;
        this.volumeRenderer.uniforms.random.value = Math.random();
    }

    setRaySteps(steps: number): void {
        this.materialOptions.raySteps = Math.max(1, Math.floor(steps));
        this.volumeRenderer.updateMaterial(this.materialOptions);
    }

    setAlphaMultiplier(value: number): void {
        this.volumeRenderer.uniforms.alphaMultiplier.value = value;
    }

    setExtinctionMultiplier(value: number): void {
        this.volumeRenderer.uniforms.extinctionMultiplier.value = value;
    }

    getGuiSchema(): AtmosphereGuiSchema {
        const schema = [
            {
                key: "raySteps",
                label: "Ray steps",
                type: "slider" as const,
                min: 8,
                max: 256,
                step: 1,
                get: () => this.materialOptions.raySteps,
                set: (v: number) => this.setRaySteps(v),
            },
            {
                key: "alphaMultiplier",
                label: "Alpha gain",
                type: "slider" as const,
                min: 0,
                max: 3,
                step: 0.05,
                get: () => this.volumeRenderer.uniforms.alphaMultiplier.value,
                set: (v: number) => this.setAlphaMultiplier(v),
            },
            {
                key: "extinctionMultiplier",
                label: "Extinction",
                type: "slider" as const,
                min: 0,
                max: 5,
                step: 0.05,
                get: () => this.volumeRenderer.uniforms.extinctionMultiplier.value,
                set: (v: number) => this.setExtinctionMultiplier(v),
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
