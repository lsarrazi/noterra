import * as THREE from "three";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";
import { orbitConfig } from "../config";

interface CameraConfig {
    type: string;
    radius: number;
    trackRotation?: boolean;
    minDistance?: number;
    maxDistance?: number;
    getObjectRotation: () => THREE.Quaternion;
}

interface CameraObservable {
    getCameraConfig: () => CameraConfig;
}

function isCameraObservable(obj: unknown): obj is CameraObservable {
    if (!obj || typeof (obj as CameraObservable).getCameraConfig !== "function")
        return false;
    try {
        const cfg = (obj as CameraObservable).getCameraConfig();
        if (!cfg || typeof cfg !== "object") return false;
        if (typeof cfg.type !== "string") return false;
        if (typeof cfg.radius !== "number") return false;
        if (typeof cfg.getObjectRotation !== "function") return false;
        return true;
    } catch (e) {
        console.warn("CameraRig: object rejected as CameraObservable", e);
        return false;
    }
}

export default class CameraRig {
    observable: CameraObservable | null;
    observableId: string | null;
    objectResolver: ((id: string) => CameraObservable | null) | null;
    prevRotation: THREE.Quaternion | null;
    latLon: {
        latitude: number;
        longitude: number;
        planetLatitude: number;
        planetLongitude: number;
    };
    controls: TrackballControls;
    baseRotateSpeed: number;
    minRotateSpeed: number;
    rotateEaseExp: number;
    zoomTargetDistance?: number;

    constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
        this.observable = null;
        this.observableId = null;
        this.objectResolver = null;
        this.prevRotation = null;
        this.latLon = {
            latitude: 0,
            longitude: 0,
            planetLatitude: 0,
            planetLongitude: 0,
        };
        this.controls = new TrackballControls(camera, domElement);
        this.controls.noZoom = true;
        this.controls.minDistance = orbitConfig.minDistance;
        this.controls.maxDistance = orbitConfig.maxDistance;

        this.baseRotateSpeed = orbitConfig.rotateBase;
        this.minRotateSpeed = orbitConfig.rotateMin;
        this.rotateEaseExp = orbitConfig.rotateEaseExp;

        this.zoomTargetDistance = camera.position
            .clone()
            .sub(this.controls.target)
            .length();

        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            const delta = event.deltaY;
            const minD = this.controls.minDistance;
            const maxD = this.controls.maxDistance;
            const current = this.zoomTargetDistance ?? maxD;
            let offset = Math.max(0, current - minD);
            if (delta < 0) {
                offset *= orbitConfig.zoomStepIn;
            } else if (delta > 0) {
                offset *= orbitConfig.zoomStepOut;
            }
            offset = THREE.MathUtils.clamp(offset, 0, maxD - minD);
            this.zoomTargetDistance = minD + offset;
        };

        domElement.addEventListener("wheel", onWheel, { passive: false });
        window.addEventListener("wheel", onWheel, { passive: false });
    }

    setObservable(observable: CameraObservable, objectId: string | null = null) {
        if (!isCameraObservable(observable)) return;
        this.observable = observable;
        this.observableId = objectId ?? this.observableId ?? null;
        this.prevRotation = null;
    }

    setObservableById(objectId: string | null) {
        if (!objectId || !this.objectResolver) return;
        const obj = this.objectResolver(objectId);
        if (!isCameraObservable(obj)) return;
        this.observableId = objectId;
        this.observable = obj ?? null;
        this.prevRotation = null;
    }

    setObjectResolver(resolver: (id: string) => CameraObservable | null) {
        this.objectResolver = resolver;
    }

    updateZoom(camera: THREE.PerspectiveCamera, dt: number) {
        if (this.zoomTargetDistance === undefined) return;
        const target = this.controls.target;
        const dir = camera.position.clone().sub(target);
        const currentDist = dir.length();
        const minDist = this.controls.minDistance;
        if (currentDist <= 0 || this.zoomTargetDistance <= 0) return;

        const offset = Math.max(0, currentDist - minDist);
        const targetOffset = Math.max(0, this.zoomTargetDistance - minDist);
        const k = orbitConfig.zoomK;
        const nextOffset =
            targetOffset + (offset - targetOffset) * Math.exp(-k * Math.max(0, dt));
        const nextDist = minDist + nextOffset;
        dir.normalize().multiplyScalar(nextDist);
        camera.position.copy(target).add(dir);
    }

    updateRotateSpeed(camera: THREE.PerspectiveCamera) {
        const target = this.controls.target;
        const dist = camera.position.distanceTo(target);
        const span = Math.max(
            1e-6,
            this.controls.maxDistance - this.controls.minDistance
        );
        const t = THREE.MathUtils.clamp(
            (dist - this.controls.minDistance) / span,
            0,
            1
        );
        const eased = Math.pow(t, this.rotateEaseExp);
        this.controls.rotateSpeed = THREE.MathUtils.lerp(
            this.minRotateSpeed,
            this.baseRotateSpeed,
            eased
        );
    }

    update(camera: THREE.PerspectiveCamera) {
        const cfg = this.observable?.getCameraConfig?.() ?? null;
        if (cfg) {
            if (cfg.minDistance !== undefined)
                this.controls.minDistance = cfg.minDistance;
            if (cfg.maxDistance !== undefined)
                this.controls.maxDistance = cfg.maxDistance;
        }

        this.controls.update();

        const currentRot = cfg?.getObjectRotation ? cfg.getObjectRotation() : null;
        if (currentRot) {
            if (cfg?.trackRotation && this.prevRotation) {
                const deltaQ = currentRot
                    .clone()
                    .multiply(this.prevRotation.clone().invert());
                this.applyRotationDelta(deltaQ);
            }
            // Keep prevRotation in sync even when tracking is off so re-enabling does not jump
            this.prevRotation = currentRot.clone();
        }

        const radius = cfg?.radius;
        const rotation = cfg?.getObjectRotation ? cfg.getObjectRotation() : null;
        if (radius !== undefined && rotation) {
            this.latLon = this.computeCenterLatLon(camera, radius, rotation);
        }
    }

    applyRotationDelta(deltaQ: THREE.Quaternion | null) {
        if (!deltaQ) return;
        const q = deltaQ.normalize();
        const target = this.controls.target;
        target.applyQuaternion(q);
        this.controls.object.position.applyQuaternion(q);
        this.controls.object.up.applyQuaternion(q);

        if (this.controls.target0) this.controls.target0.applyQuaternion(q);
        if (this.controls.position0) this.controls.position0.applyQuaternion(q);
        this.controls.update();
    }

    getGuiSchema() {
        const schema = [
            {
                key: "cameraType",
                label: "Camera type",
                type: "readonly",
                get: () => this.observable?.getCameraConfig?.()?.type ?? "—",
            },
            {
                key: "targetObject",
                label: "Target object",
                type: "object-select",
                // Only list objects that implement CameraObservable and are not the rig itself
                filter: (o: { id: string; object: unknown }) =>
                    o.id !== "camera" && isCameraObservable(o.object),
                get: () => this.observableId,
                set: (id: string) => this.setObservableById(id),
            },
            {
                key: "latitude",
                label: "Latitude (°)",
                type: "readonly",
                format: (v: number) => v.toFixed(2),
                get: () => this.latLon.latitude,
            },
            {
                key: "longitude",
                label: "Longitude (°)",
                type: "readonly",
                format: (v: number) => v.toFixed(2),
                get: () => this.latLon.longitude,
            },
            {
                key: "planetLatitude",
                label: "Planet latitude (°)",
                type: "readonly",
                format: (v: number) => v.toFixed(2),
                get: () => this.latLon.planetLatitude,
            },
            {
                key: "planetLongitude",
                label: "Planet longitude (°)",
                type: "readonly",
                format: (v: number) => v.toFixed(2),
                get: () => this.latLon.planetLongitude,
            },
        ];
        return schema;
    }

    computeCenterLatLon(
        camera: THREE.PerspectiveCamera,
        radius: number,
        rotation: THREE.Quaternion,
        planetRotation?: THREE.Quaternion
    ) {
        const targetPos = this.controls.target.clone();
        const eye = camera.position.clone();
        const toCenter = eye.sub(targetPos);
        const dist = toCenter.length();
        const dir = toCenter.normalize();

        const intersection = targetPos.clone().add(dir.multiplyScalar(radius));
        const rel = intersection.clone().normalize();
        const planetRel = planetRotation
            ? rel.clone().applyQuaternion(planetRotation)
            : rel;

        const lat = Math.asin(THREE.MathUtils.clamp(rel.y / radius, -1, 1));
        const lon = Math.atan2(rel.x, -rel.z);
        const planetLat = Math.asin(
            THREE.MathUtils.clamp(planetRel.y / radius, -1, 1)
        );
        const planetLon = Math.atan2(planetRel.x, -planetRel.z);

        const deg = THREE.MathUtils.radToDeg;
        return {
            latitude: Number(deg(lat).toFixed(2)),
            longitude: Number(deg(lon).toFixed(2)),
            planetLatitude: Number(deg(planetLat).toFixed(2)),
            planetLongitude: Number(deg(planetLon).toFixed(2)),
        };
    }
}
