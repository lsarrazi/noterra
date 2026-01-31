import * as THREE from "three";
import { trait } from "../traits";

export type CameraConfig = {
    type: 'trackball';
    radius: number;
    trackRotation?: boolean;
    minDistance?: number;
    maxDistance?: number;
    getObjectRotation: () => THREE.Quaternion;
    getObjectPosition: () => THREE.Vector3;
};

// Trait example pattern: call `CameraObservable.from(instance)` to project the trait.
export class CameraObservable {
    static from = trait(CameraObservable);

    getCameraConfig!: () => CameraConfig;
}

export type CameraObservableTrait = ReturnType<typeof CameraObservable.from>;
