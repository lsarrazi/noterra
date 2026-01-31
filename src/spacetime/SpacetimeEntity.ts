import { Vector3 } from "three";
import { trait } from "../traits";

export type GravityPointSource = {
    kind: "point";
    /** Gravitational mass (engine units) */
    mass: number;
    /** Softening length (prevents r=0 singularities) */
    epsilon: number;
};

export type GravitySource = GravityPointSource;

export class SpacetimeEntity {
    static from = trait(SpacetimeEntity);



    /** Rest mass (for future relativistic momentum, energy, etc.) */
    getRestMass!: () => number;

    /** How this entity backreacts on spacetime (V1: point mass) */
    getGravitySource!: () => GravitySource;

    /**
   * Called by the Manifold after worldline integration.
   * MUST NOT modify spacetime state.
   */
    onSpacetimeTick?(state: {
        time: number;
        tau: number;
        position: Vector3;
        velocity: Vector3;
    }): void;
}

export type SpacetimeEntityTrait = ReturnType<typeof SpacetimeEntity.from>;

