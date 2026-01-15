import * as THREE from "three";
import { trait } from "../traits";

export type CameraConfig = {
  type: string;
  radius: number;
  trackRotation?: boolean;
  minDistance?: number;
  maxDistance?: number;
  getObjectRotation: () => THREE.Quaternion;
};

// Trait example pattern: call `CameraObservable.from(instance)` to project the trait.
export class CameraObservable {
  static from = trait(CameraObservable);

  getCameraConfig!: () => CameraConfig;
}

export type CameraObservableTrait = ReturnType<typeof CameraObservable.from>;
