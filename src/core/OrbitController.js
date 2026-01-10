import * as THREE from "../../three.js/three.module.min.js";
import { orbitConfig } from "../config/index.js";
import { TrackballControls } from "../../three.js/TrackballControls.js";

export default class OrbitController {
  constructor(camera, domElement) {
    this.controls = new TrackballControls(camera, domElement);
    //this.controls.enableDamping = orbitConfig.enableDamping;
    //this.controls.dampingFactor = orbitConfig.dampingFactor;
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

  update() {
    this.controls.update();
  }

  applyRotationDelta(deltaQ) {
    if (!deltaQ) return;
    const q = deltaQ.normalize();
    const target = this.controls.target;
    target.applyQuaternion(q);
    this.controls.object.position.applyQuaternion(q);
    this.controls.object.up.applyQuaternion(q);

    // Keep saved refs coherent so future interactions aren't drifted
    if (this.controls.target0) this.controls.target0.applyQuaternion(q);
    if (this.controls.position0) this.controls.position0.applyQuaternion(q);
    this.controls.update();
  }
}
