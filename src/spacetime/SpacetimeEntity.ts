import { Vector3 } from "three";
import { trait } from "../traits";
import { GuiTab } from "../ui/GuiManager";

export type GravityPointSource = {
    kind: "point";
    /** Gravitational mass (engine units) */
    mass: number;
    /** Softening length (prevents r=0 singularities) */
    epsilon: number;
};

export type SpacetimeState = {
    time: number;
    tau: number;
    position: Vector3;
    velocity: Vector3;
}

export type GravitySource = GravityPointSource;

export class SpacetimeEntity {
    static from = trait(SpacetimeEntity);

    /** Rest mass (for future relativistic momentum, energy, etc.) */
    getRestMass(): number { return 0; }

    /** How this entity backreacts on spacetime (V1: point mass) */
    getGravitySource(): GravitySource { return { kind: "point", mass: 0, epsilon: 0 }; }

    /**
   * Called by the Manifold after worldline integration.
   * MUST NOT modify spacetime state.
   */
    onSpacetimeTick?(state: SpacetimeState): void;

    getSpacetimeState(): SpacetimeState { throw new Error("Not implemented, getSpacetimeState should return the spacetime object registered at each spacetime tick"); }

    getSpacetimeGuiTab?(): GuiTab {
        return {
            id: "spacetime",
            label: "Spacetime",
            schema: [
                {
                    key: "restMass",
                    type: "slider",
                    label: "Rest mass",
                    get: () => this.getRestMass()
                },
                {
                    key: "properTime",
                    type: "readonly",
                    label: "Proper Time",
                    get: () => this.getSpacetimeState().tau
                },
                {
                    key: "coordinateTime",
                    type: "readonly",
                    label: "Coordinate Time",
                    get: () => this.getSpacetimeState().time
                },
                {
                    key: "position",
                    type: "slider",
                    label: "Position",
                    get: () => this.getSpacetimeState().position
                },
                {
                    key: "velocity",
                    type: "slider",
                    label: "Velocity",
                    get: () => this.getSpacetimeState().velocity
                },
                {
                    type: "folder",
                    label: "Gravity Source",
                    schema: [
                        {
                            key: "gravitySourceType",
                            type: "readonly",
                            label: "Gravity Source Type",
                            get: () => this.getGravitySource().kind
                        },
                        {
                            key: "gravitySourceMass",
                            type: "slider",
                            label: "Mass",
                            get: () => this.getGravitySource().mass
                        },
                        {
                            key: "gravitySourceEpsilon",
                            type: "slider",
                            label: "Softening Length (Epsilon)",
                            get: () => this.getGravitySource().epsilon
                        },
                    ]
                },

            ],
        }
    }
}

export type SpacetimeEntityTrait = ReturnType<typeof SpacetimeEntity.from>;

