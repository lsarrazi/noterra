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
    volumeRenderer: VolumeRenderer;
    materialOptions: AtmosphereMaterialOptions;

    constructor() {
        this.volumeRenderer = new VolumeRenderer();
        // Create a depth texture and render target
        const depthTexture = new THREE.DepthTexture();
        depthTexture.format = THREE.DepthFormat;
        depthTexture.type = THREE.UnsignedShortType;

        const uniforms = this.volumeRenderer.uniforms;
        uniforms.volumeSize.value.set(2, 2, 2);
        uniforms.clipMin.value.set(-1, -1, -1);
        uniforms.clipMax.value.set(1, 1, 1);
        uniforms.valueAdded.value = 0;
        uniforms.volumeResolution.value.set(.1, .1, .1);
        uniforms.volumeSize.value.set(2, 2, 2);
        uniforms.volumeOrigin.value.set(-1, -1, -1);
        //uniforms.voxelSize.value.set(.1, .1, .1);
        uniforms.timeCount.value = 100
        //uniforms.depthTexture.value = renderTarget.depthTexture

        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 1;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Failed to get 2D context for atmosphere palette");
        const gradient = ctx.createLinearGradient(0, 0, 256, 0);
        gradient.addColorStop(0.0, "rgba(250, 250, 250, 1.0)");  // vacuum
        gradient.addColorStop(0.25, "rgba(16, 60, 103, 0.15)"); // thin air
        gradient.addColorStop(0.6, "rgba(2, 135, 224, 0.35)"); // blue haze
        gradient.addColorStop(0.85, "rgba(200,220,230, 0.55)"); // horizon milk
        gradient.addColorStop(0.98, "rgba(255, 255, 255, 1.0)"); // dense air
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 256, 1);
        const paletteTexture = new THREE.CanvasTexture(canvas);

        uniforms.palette.value = paletteTexture;
        uniforms.extinctionMultiplier.value = atmosphereConfig.extinctionMultiplier;
        uniforms.alphaMultiplier.value = atmosphereConfig.alphaMultiplier;


        const planetFunction = `
    vec3 p = vec3(x, y, z) - vec3(1.0);
float dist = length(p);
if (dist > 0.6) { return 0.0; }
if (dist < 0.5) { return 0.0; }
return 1.0 - dist;

`;

        this.materialOptions = {
            customFunction: planetFunction,
            useDirectionalLights: false,
            invertNormals: true,
            raySteps: atmosphereConfig.raySteps,
            useExtinctionCoefficient: true,
            useValueAsExtinctionCoefficient: true,
            useRandomStart: true,
            usePointLights: true
        };

        this.volumeRenderer.updateMaterial(this.materialOptions);
    }

    update(time: number, camera?: THREE.PerspectiveCamera): void {

        //this.volumeRenderer.uniforms.time.value = time;
        //this.volumeRenderer.uniforms.random.value = Math.random();

    }

    render(time: number, camera?: THREE.PerspectiveCamera, planetPosition?: THREE.Vector3, planetRotation?: THREE.Quaternion): void {
        if (camera) {
            this.volumeRenderer.updateCameraUniforms(camera);
        }

        // Build volume transformation matrix from planet position and rotation
        if (planetPosition && planetRotation) {

            // Build volume transformation matrix from planet position and rotation

            const fovY = THREE.MathUtils.degToRad(camera.fov);
            const fovX = 2 * Math.atan(Math.tan(fovY * 0.5) * camera.aspect);
            const kx = 1 / Math.cos(fovX * 0.5);
            const ky = 1 / Math.cos(fovY * 0.5);
            // distorsion légère
            const eps = 0.05;
            const sx = THREE.MathUtils.lerp(1, kx, eps);
            const sy = THREE.MathUtils.lerp(1, ky, eps);
            const sz = 1;

            const volumeMatrix = new THREE.Matrix4();
            volumeMatrix.compose(planetPosition, planetRotation, new THREE.Vector3(sy, sx, sz));


            this.volumeRenderer.uniforms.volumeMatrix.value.copy(volumeMatrix);
            this.volumeRenderer.uniforms.volumeInverseMatrix.value.copy(volumeMatrix).invert();
            this.volumeRenderer.uniforms.volumePosition.value.copy(planetPosition);
        }
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
            {
                key: "volumeSizeX",
                label: "Volume Size X",
                type: "slider" as const,
                min: 0,
                max: 10,
                step: 0.1,
                get: () => this.volumeRenderer.uniforms.volumeSize.value.x,
                set: (v: number) => { this.volumeRenderer.uniforms.volumeSize.value.x = v; },
            },
            {
                key: "volumeSizeY",
                label: "Volume Size Y",
                type: "slider" as const,
                min: 0,
                max: 10,
                step: 0.1,
                get: () => this.volumeRenderer.uniforms.volumeSize.value.y,
                set: (v: number) => { this.volumeRenderer.uniforms.volumeSize.value.y = v; },
            },
            {
                key: "volumeSizeZ",
                label: "Volume Size Z",
                type: "slider" as const,
                min: 0,
                max: 10,
                step: 0.1,
                get: () => this.volumeRenderer.uniforms.volumeSize.value.z,
                set: (v: number) => { this.volumeRenderer.uniforms.volumeSize.value.z = v; },
            },
            {
                key: "clipMinX",
                label: "Clip Min X",
                type: "slider" as const,
                min: -5,
                max: 5,
                step: 0.1,
                get: () => this.volumeRenderer.uniforms.clipMin.value.x,
                set: (v: number) => { this.volumeRenderer.uniforms.clipMin.value.x = v; },
            },
            {
                key: "clipMinY",
                label: "Clip Min Y",
                type: "slider" as const,
                min: -5,
                max: 5,
                step: 0.1,
                get: () => this.volumeRenderer.uniforms.clipMin.value.y,
                set: (v: number) => { this.volumeRenderer.uniforms.clipMin.value.y = v; },
            },
            {
                key: "clipMinZ",
                label: "Clip Min Z",
                type: "slider" as const,
                min: -5,
                max: 5,
                step: 0.1,
                get: () => this.volumeRenderer.uniforms.clipMin.value.z,
                set: (v: number) => { this.volumeRenderer.uniforms.clipMin.value.z = v; },
            },
            {
                key: "clipMaxX",
                label: "Clip Max X",
                type: "slider" as const,
                min: -5,
                max: 5,
                step: 0.1,
                get: () => this.volumeRenderer.uniforms.clipMax.value.x,
                set: (v: number) => { this.volumeRenderer.uniforms.clipMax.value.x = v; },
            },
            {
                key: "clipMaxY",
                label: "Clip Max Y",
                type: "slider" as const,
                min: -5,
                max: 5,
                step: 0.1,
                get: () => this.volumeRenderer.uniforms.clipMax.value.y,
                set: (v: number) => { this.volumeRenderer.uniforms.clipMax.value.y = v; },
            },
            {
                key: "clipMaxZ",
                label: "Clip Max Z",
                type: "slider" as const,
                min: -5,
                max: 5,
                step: 0.1,
                get: () => this.volumeRenderer.uniforms.clipMax.value.z,
                set: (v: number) => { this.volumeRenderer.uniforms.clipMax.value.z = v; },
            },
            {
                key: "valueAdded",
                label: "Value Added",
                type: "slider" as const,
                min: -1,
                max: 1,
                step: 0.01,
                get: () => this.volumeRenderer.uniforms.valueAdded.value,
                set: () => { },
            },
            {
                key: "volumeResolution",
                label: "Volume Resolution X",
                type: "slider" as const,
                min: 0,
                max: 10,
                step: 0.01,
                get: () => this.volumeRenderer.uniforms.volumeResolution.value.x,
                set: (v: number) => { this.volumeRenderer.uniforms.volumeResolution.value.x = v; },
            },
            {
                key: "volumeResolution",
                label: "Volume Resolution Y",
                type: "slider" as const,
                min: 0,
                max: 10,
                step: 0.01,
                get: () => this.volumeRenderer.uniforms.volumeResolution.value.y,
                set: (v: number) => { this.volumeRenderer.uniforms.volumeResolution.value.y = v; },
            },
            {
                key: "volumeResolution",
                label: "Volume Resolution Z",
                type: "slider" as const,
                min: 0,
                max: 10,
                step: 0.01,
                get: () => this.volumeRenderer.uniforms.volumeResolution.value.z,
                set: (v: number) => { this.volumeRenderer.uniforms.volumeResolution.value.z = v; },
            },
            {
                key: "voxelSize",
                label: "Voxel Size X",
                type: "slider" as const,
                min: 0,
                max: 10,
                step: 0.01,
                get: () => this.volumeRenderer.uniforms.voxelSize.value.x,
                set: (v: number) => { this.volumeRenderer.uniforms.voxelSize.value.x = v; },
            },
            {
                key: "voxelSize",
                label: "Voxel Size Y",
                type: "slider" as const,
                min: 0,
                max: 10,
                step: 0.01,
                get: () => this.volumeRenderer.uniforms.voxelSize.value.y,
                set: (v: number) => { this.volumeRenderer.uniforms.voxelSize.value.y = v; },
            },

            {
                key: "voxelSize",
                label: "Voxel Size Z",
                type: "slider" as const,
                min: 0,
                max: 10,
                step: 0.01,
                get: () => this.volumeRenderer.uniforms.voxelSize.value.z,
                set: (v: number) => { this.volumeRenderer.uniforms.voxelSize.value.z = v; },
            },
            {
                key: "timeCount",
                label: "Time Count",
                type: "slider" as const,
                min: 0,
                max: 1000,
                step: 1,
                get: () => this.volumeRenderer.uniforms.timeCount.value,
                set: (v: number) => { this.volumeRenderer.uniforms.timeCount.value = v; },
            },
            {
                key: "time",
                label: "Time",
                type: "slider" as const,
                min: 0,
                max: 1000,
                step: 0.1,
                get: () => this.volumeRenderer.uniforms.time.value,
                set: () => { },
            },
            {
                key: "random",
                label: "Random",
                type: "slider" as const,
                min: 0,
                max: 1,
                step: 0.01,
                get: () => this.volumeRenderer.uniforms.random.value,
                set: () => { },
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
