import * as THREE from "../../three.js/three.module.min.js";
import { TrackballControls } from "../../three.js/TrackballControls.js";
import { orbitConfig } from "../config/index.js";

function isCameraObservable(obj) {
  if (!obj || typeof obj.getCameraConfig !== "function") return false;
  try {
    const cfg = obj.getCameraConfig();
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
  constructor(camera, domElement) {
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
    this.controls.enableZoom = false;
    this.controls.noZoom = true;
    this.controls.minDistance = orbitConfig.minDistance;
    this.controls.maxDistance = orbitConfig.maxDistance;
    this.controls.minAzimuthAngle = -Infinity;
    this.controls.maxAzimuthAngle = Infinity;

    this.baseRotateSpeed = orbitConfig.rotateBase;
    this.minRotateSpeed = orbitConfig.rotateMin;
    this.rotateEaseExp = orbitConfig.rotateEaseExp;

    this.zoomTargetDistance = camera.position
      .clone()
      .sub(this.controls.target)
      .length();

    const onWheel = (event) => {
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

  setObservable(observable, objectId = null) {
    if (!isCameraObservable(observable)) return;
    this.observable = observable;
    this.observableId = objectId ?? this.observableId ?? null;
    this.prevRotation = null;
  }

  setObservableById(objectId) {
    if (!objectId || !this.objectResolver) return;
    const obj = this.objectResolver(objectId);
    if (!isCameraObservable(obj)) return;
    this.observableId = objectId;
    this.observable = obj ?? null;
    this.prevRotation = null;
  }

  setObjectResolver(resolver) {
    this.objectResolver = resolver;
  }

  updateZoom(camera, dt) {
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

  updateRotateSpeed(camera) {
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

  update(camera) {
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

  applyRotationDelta(deltaQ) {
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
        filter: (o) => o.id !== "camera" && isCameraObservable(o.object),
        get: () => this.observableId,
        set: (id) => this.setObservableById(id),
      },
      {
        key: "latitude",
        label: "Latitude (°)",
        type: "readonly",
        format: (v) => v.toFixed(2),
        get: () => this.latLon.latitude,
      },
      {
        key: "longitude",
        label: "Longitude (°)",
        type: "readonly",
        format: (v) => v.toFixed(2),
        get: () => this.latLon.longitude,
      },
      {
        key: "planetLatitude",
        label: "Planet lat (°)",
        type: "readonly",
        format: (v) => v.toFixed(2),
        get: () => this.latLon.planetLatitude,
      },
      {
        key: "planetLongitude",
        label: "Planet lon (°)",
        type: "readonly",
        format: (v) => v.toFixed(2),
        get: () => this.latLon.planetLongitude,
      },
    ];

    return {
      tabs: [{ id: "camera", label: "Camera", schema }],
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
