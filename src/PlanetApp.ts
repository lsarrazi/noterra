import * as THREE from "three";
import SceneManager from "./core/SceneManager";
import CameraRig from "./camera/CameraRig";
import PlanetView from "./planet/PlanetView";
import GuiManager from "./ui/GuiManager";
import { planetSurfaceConfig } from "./config";
import { GuiConfigurable } from "./traits/GuiConfigurable";
import { CameraObservable } from "./traits/CameraObservable";
import { ObjectsRegistry } from "./core/ObjectsRegistry";
import StarView from "./planet/StarView";
import { SpacetimeManifold } from "./spacetime/SpacetimeManifold";

export default class PlanetApp {
    static _init(): void {
        window.addEventListener("load", () => {
            window["app"] = new PlanetApp();
            window["app"].animate();
        });
    }

    sceneManager: SceneManager;
    guiManager: GuiManager | null;
    cameraRig: CameraRig;
    planet: PlanetView;
    spacetimeManifold = new SpacetimeManifold({
        c: 299792458,
        G: 6.67430e-11,
        enableProperTime: true,
        enableSoftening: true,
    });
    star: StarView;
    objectsRegistry: ObjectsRegistry;
    lastTime: number | null;
    time: number;

    constructor() {
        const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;

        this.sceneManager = new SceneManager(canvas ?? undefined);
        this.sceneManager.setBackground(0x000020);
        this.guiManager = null;

        // Camera setup
        this.sceneManager.camera.position.z = 2;

        // Modules
        this.cameraRig = new CameraRig(
            this.sceneManager.camera,
            this.sceneManager.renderer.domElement
        );
        this.planet = new PlanetView(planetSurfaceConfig);
        this.star = new StarView();

        this.objectsRegistry = new ObjectsRegistry();

        this.objectsRegistry.registerTrait({ trait: GuiConfigurable, description: "Objects that provide a GUI schema" });
        this.objectsRegistry.registerTrait({ trait: CameraObservable, description: "Objects that provide camera configuration" });

        this.objectsRegistry.register({
            label: "Scene",
            object: this.sceneManager,
            traits: []
        });

        this.objectsRegistry.register({
            label: "Camera Rig",
            object: this.cameraRig,
            traits: [GuiConfigurable]
        });

        this.objectsRegistry.register({
            label: "Planet Noterra",
            object: this.planet,
            traits: [GuiConfigurable, CameraObservable]
        });

        this.objectsRegistry.register({
            label: "Angelad",
            object: this.star,
            traits: [GuiConfigurable, CameraObservable]
        })

        this.objectsRegistry.register({
            label: "Spacetime Manifold",
            object: this.spacetimeManifold,
            traits: [GuiConfigurable]
        });


        this.cameraRig.setObservable(this.planet);

        this.sceneManager.add(this.planet.group);
        this.sceneManager.add(this.planet.axisHelper);
        this.sceneManager.add(this.star.group);

        this.spacetimeManifold.register(this.planet, {
            x: new THREE.Vector3(0, 0, 0),
            v: new THREE.Vector3(0, .4, 0),
        });

        this.spacetimeManifold.register(this.star, {
            x: new THREE.Vector3(10, 0, 0),
            v: new THREE.Vector3(0, 0, 0),
        });

        window.addEventListener("resize", () => this.handleResize());
        this.handleResize();

        this.#setupGui();

        this.lastTime = null;
        this.time = 0;
    }

    #setupGui(): void {
        this.guiManager = new GuiManager();
        if (!this.guiManager.isReady()) return;

        this.guiManager.setGlobalsSchema([]);

        this.guiManager.setObjectsRegistry(this.objectsRegistry);
    }

    handleResize(): void {
        this.sceneManager.onResize();
    }

    animate(): void {
        requestAnimationFrame(() => this.animate());
        const now = performance.now();
        let frameDt = 0;
        if (this.lastTime !== null) {
            frameDt = (now - this.lastTime) / 1000;
            this.time += frameDt;
        }
        this.lastTime = now;

        this.spacetimeManifold.step(frameDt);

        this.planet.updateGridWidthForCamera(
            this.sceneManager.camera,
            this.sceneManager.renderer.domElement?.height ?? 1
        );
        this.planet.update(this.time, frameDt);

        this.star.update(this.time, frameDt);

        // Update camera first to get final position/rotation
        this.cameraRig.update(this.sceneManager.camera, frameDt);

        this.planet.render(this.time, this.sceneManager.camera);
        this.star.render(this.time, this.sceneManager.camera);

        this.guiManager?.refresh();

        this.sceneManager.render();
    }

    static getApp(): PlanetApp {
        return window["app"];
    }

    getResolution(): { width: number; height: number } {
        const { width, height } = this.sceneManager.renderer.domElement;
        return { width, height };
    }
}
