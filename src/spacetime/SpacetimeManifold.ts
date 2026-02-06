import * as THREE from "three";
import { SpacetimeEntityTrait, GravityPointSource } from "./SpacetimeEntity";
import { GuiConfigurable } from "../traits/GuiConfigurable";
import { GuiTabs } from "../ui/GuiManager";

export type WorldlineState = {
    /** Coordinate time */
    t: number;

    /** Proper time accumulated */
    tau: number;

    /** Position, velocity, acceleration in coordinate chart */
    x: THREE.Vector3;
    v: THREE.Vector3;
    a: THREE.Vector3;

    /** Cached gravitational potential Φ(x) */
    phi: number;
};

export type ManifoldConfig = {
    /** Speed of light */
    c: number;

    /** Gravitational constant */
    G: number;

    /** Clamp accelerations (numerical safety) */
    maxAccel?: number;

    /** Enable proper time integration */
    enableProperTime?: boolean;

    /** Enable softening */
    enableSoftening?: boolean;
};


export class SpacetimeManifold
    implements GuiConfigurable {
    private cfg: ManifoldConfig;

    private entities: SpacetimeEntityTrait[] = [];
    private states: WorldlineState[] = [];

    constructor(cfg: ManifoldConfig) {
        this.cfg = cfg;
    }

    register(
        entity: SpacetimeEntityTrait,
        initial: {
            t?: number;
            tau?: number;
            x: THREE.Vector3;
            v: THREE.Vector3;
        }
    ) {
        this.entities.push(entity);
        this.states.push({
            t: initial.t ?? 0,
            tau: initial.tau ?? 0,
            x: initial.x.clone(),
            v: initial.v.clone(),
            a: new THREE.Vector3(),
            phi: 0,
        });
    }

    /** Compute accelerations and potentials at given positions */
    private computeField(
        positions: THREE.Vector3[],
        outA: THREE.Vector3[],
        outPhi: number[]
    ) {
        const n = this.entities.length;
        const G = this.cfg.G;

        for (let i = 0; i < n; i++) {
            let ax = 0, ay = 0, az = 0;
            let phi = 0;

            const xi = positions[i];
            const srcI = this.entities[i].getGravitySource() as GravityPointSource;

            for (let j = 0; j < n; j++) {
                if (i === j) continue;

                const srcJ = this.entities[j].getGravitySource() as GravityPointSource;

                const dx = positions[j].x - xi.x;
                const dy = positions[j].y - xi.y;
                const dz = positions[j].z - xi.z;

                const eps =
                    this.cfg.enableSoftening === false
                        ? 0
                        : Math.max(srcI.epsilon, srcJ.epsilon);

                const r2 = dx * dx + dy * dy + dz * dz + eps * eps;
                const invR = 1 / Math.sqrt(r2);
                const invR3 = invR * invR * invR;

                phi += -G * srcJ.mass * invR;

                const s = G * srcJ.mass * invR3;
                ax += s * dx;
                ay += s * dy;
                az += s * dz;
            }

            if (this.cfg.maxAccel != null) {
                const mag = Math.sqrt(ax * ax + ay * ay + az * az);
                if (mag > this.cfg.maxAccel && mag > 0) {
                    const k = this.cfg.maxAccel / mag;
                    ax *= k; ay *= k; az *= k;
                }
            }

            outA[i].set(ax, ay, az);
            outPhi[i] = phi;
        }
    }

    /** Velocity Verlet integration step */
    step(dt: number) {
        if (dt <= 0) return;

        const n = this.states.length;

        // Snapshot current positions
        const x0 = this.states.map(s => s.x.clone());

        // Buffers
        const a0 = this.states.map(s => s.a.clone());
        const a1 = this.states.map(() => new THREE.Vector3());
        const phi1 = new Array<number>(n);

        // 1️⃣ x(t+dt) = x + v dt + 1/2 a dt²
        for (let i = 0; i < n; i++) {
            const s = this.states[i];
            s.x.addScaledVector(s.v, dt)
                .addScaledVector(s.a, 0.5 * dt * dt);
        }

        // 2️⃣ a(t+dt), Φ(t+dt)
        this.computeField(
            this.states.map(s => s.x),
            a1,
            phi1
        );

        // 3️⃣ v(t+dt) = v + 1/2 (a + a_new) dt
        for (let i = 0; i < n; i++) {
            const s = this.states[i];
            s.v.addScaledVector(a0[i].add(a1[i]), 0.5 * dt);
            s.a.copy(a1[i]);
            s.phi = phi1[i];
            s.t += dt;
        }

        // 4️⃣ Proper time integration (GR faible)
        if (this.cfg.enableProperTime !== false) {
            const c2 = this.cfg.c * this.cfg.c;

            for (let i = 0; i < n; i++) {
                const s = this.states[i];
                const v2 = s.v.lengthSq();
                const dtaudt = 1 + s.phi / c2 - v2 / (2 * c2);
                s.tau += dt * dtaudt;
            }
        } else {
            for (const s of this.states) {
                s.tau += dt;
            }
        }

        for (let i = 0; i < this.entities.length; i++) {
            const entity = this.entities[i];
            const state = this.states[i];
            const newState = {
                time: state.t,
                tau: state.tau,
                position: state.x.clone(),
                velocity: state.v.clone(),
            };

            entity.spacetimeState = newState;
            entity.onSpacetimeTick?.(newState);
        }
    }

    getStates(): readonly WorldlineState[] {
        return this.states;
    }

    getGuiSchema(): GuiTabs {
        return {
            tabs: [
                {
                    id: "manifold",
                    label: "Manifold",
                    schema: [
                        {
                            type: "slider",
                            key: "G",
                            label: "Gravitational Constant",
                            min: -1e9,
                            max: 1e9,
                            step: 1e-12,
                            get: () => this.cfg.G,
                            set: (v: number) => { this.cfg.G = v; }
                        },
                        {
                            type: "slider",
                            key: "c",
                            label: "Speed of Light",
                            min: 1e6,
                            max: 1e9,
                            step: 1e6,
                            get: () => this.cfg.c,
                            set: (v: number) => { this.cfg.c = v; }
                        },
                        {
                            type: "slider",
                            key: "maxAccel",
                            label: "Max Acceleration",
                            min: 0,
                            max: 1e12,
                            step: 1e9,
                            get: () => this.cfg.maxAccel ?? 0,
                            set: (v: number) => { this.cfg.maxAccel = v > 0 ? v : undefined; }
                        },
                        {
                            type: "toggle",
                            key: "enableProperTime",
                            label: "Enable Proper Time",
                            get: () => this.cfg.enableProperTime ?? true,
                            set: (v: boolean) => { this.cfg.enableProperTime = v; }
                        },
                        {
                            type: "toggle",
                            key: "enableSoftening",
                            label: "Enable Softening",
                            get: () => this.cfg.enableSoftening ?? true,
                            set: (v: boolean) => { this.cfg.enableSoftening = v; }
                        }
                    ]
                }
            ]
        };
    }
}