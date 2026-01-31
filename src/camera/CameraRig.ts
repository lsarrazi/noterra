import * as THREE from "three";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";
import { orbitConfig } from "../config";
import { CameraObservable } from "../traits/CameraObservable";
import { GuiTabs } from "../ui/GuiManager";
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

    constructor(protected camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
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
        this.observable = observable;
        this.observableId = objectId ?? this.observableId ?? null;
        this.prevRotation = null;

        const config = observable.getCameraConfig();
        this.controls.minDistance = config.minDistance;
        this.controls.maxDistance = config.maxDistance;
        this.controls.target.set(...config.getObjectPosition().toArray());

        this.zoomTargetDistance = this.camera.position
            .clone()
            .sub(this.controls.target)
            .length();

        this.baseRotateSpeed = orbitConfig.rotateBase;
        this.minRotateSpeed = orbitConfig.rotateMin;
        this.rotateEaseExp = orbitConfig.rotateEaseExp;

        console.log("CameraRig: set observable", this.observable, this.observableId);
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

    update(camera: THREE.PerspectiveCamera, frameDt: number) {

        const cfg = this.observable?.getCameraConfig?.() ?? null;
        if (cfg) {
            if (cfg.minDistance !== undefined)
                this.controls.minDistance = cfg.minDistance;
            if (cfg.maxDistance !== undefined)
                this.controls.maxDistance = cfg.maxDistance;
        }

        const currentPosition = cfg?.getObjectPosition();
        if (currentPosition) {
            // Calculate the translation delta
            const delta = currentPosition.clone().sub(this.controls.target);

            // Apply the same translation to both target and camera
            this.controls.target.copy(currentPosition);
            camera.position.add(delta);
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

        // Updates
        this.updateZoom(camera, frameDt);
        this.updateRotateSpeed(camera);





        const radius = cfg?.radius;
        const rotation = cfg?.getObjectRotation ? cfg.getObjectRotation() : null;
        if (radius !== undefined && rotation) {
            this.latLon = this.computeCenterLatLon(camera, radius, rotation);
        }
    }

    applyRotationDelta(deltaQ: THREE.Quaternion | null) {
        if (!deltaQ) return;
        const q = deltaQ.normalize();
        const target = this.controls.target.clone();

        // Rotate camera position around the target (not around origin!)
        const cameraOffset = this.controls.object.position.clone().sub(target);
        cameraOffset.applyQuaternion(q);
        this.controls.object.position.copy(target).add(cameraOffset);

        // Rotate up vector
        this.controls.object.up.applyQuaternion(q);

        // Update saved positions if they exist
        if (this.controls.target0) {
            const target0Offset = this.controls.target0.clone().sub(target);
            target0Offset.applyQuaternion(q);
            this.controls.target0.copy(target).add(target0Offset);
        }
        if (this.controls.position0) {
            const position0Offset = this.controls.position0.clone().sub(target);
            position0Offset.applyQuaternion(q);
            this.controls.position0.copy(target).add(position0Offset);
        }

        this.controls.update();
    }

    getGuiSchema(): GuiTabs {
        return {
            tabs: [
                {
                    label: "Camera Rig",
                    id: "camera-rig",
                    schema: [
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
                            traits: [CameraObservable],
                            get: () => this.observable,
                            set: (observable) => this.setObservable(observable),
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
                        {
                            key: "position",
                            label: "Camera position",
                            type: "vector",
                            get: () => this.camera.position,
                        },
                        {
                            key: "rotation",
                            label: "Camera rotation",
                            type: "vector",
                            get: () => this.camera.rotation,
                        },
                        {
                            key: "planetPosition",
                            label: "Planet position",
                            type: "vector",
                            get: () =>
                                this.observable?.getCameraConfig?.().getObjectPosition() ??
                                new THREE.Vector3(),
                        },
                        {
                            "key": "distanceToTarget",
                            "label": "Distance to target",
                            "type": "readonly",
                            "get": () => this.camera.position.distanceTo(this.controls.target)
                        },
                        {
                            "key": "zoomLevel",
                            "label": "Zoom level",
                            "type": "readonly",
                            "get": () => this.zoomTargetDistance - 0.5
                        },
                    ]
                }

            ]
        };
    }

    computeCenterLatLon(camera, radius, planetRotation) {
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        dir.normalize();
        const origin = camera.position.clone();

        const a = dir.dot(dir);
        const b = 2 * origin.dot(dir);
        const c = origin.dot(origin) - radius * radius;
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
            hit = dir.clone().negate().normalize().multiplyScalar(radius);
        }

        const latRad = Math.asin(THREE.MathUtils.clamp(hit.y / radius, -1, 1));
        const lonRad = Math.atan2(hit.x, -hit.z);
        const worldLat = THREE.MathUtils.radToDeg(latRad);
        const worldLon = THREE.MathUtils.radToDeg(lonRad);

        let planetLat = worldLat;
        let planetLon = worldLon;
        if (planetRotation) {
            const invRot = planetRotation.clone().invert();
            const localHit = hit.clone().applyQuaternion(invRot);
            const platRad = Math.asin(
                THREE.MathUtils.clamp(localHit.y / radius, -1, 1)
            );
            const plonRad = Math.atan2(localHit.x, -localHit.z);
            planetLat = THREE.MathUtils.radToDeg(platRad);
            planetLon = THREE.MathUtils.radToDeg(plonRad);
        }

        return {
            latitude: Number(worldLat.toFixed(2)),
            longitude: Number(worldLon.toFixed(2)),
            planetLatitude: Number(planetLat.toFixed(2)),
            planetLongitude: Number(planetLon.toFixed(2)),
        };
    }

}
