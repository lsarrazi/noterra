import { FolderApi, Pane } from "tweakpane";
import { ObjectsRegistry, TraitTupleToInstanceIntersection } from "../core/ObjectsRegistry";
import { CameraObservable } from "../traits/CameraObservable";
import { GuiConfigurable } from "../traits/GuiConfigurable";
import _ from "lodash";
import { Trait } from "../traits";
import { Vector2, Vector3, Vector4 } from "three";

// Declarative, lazy GUI builder for Tweakpane.
// Schema entries: { key, label, type: 'toggle'|'slider'|'readonly', min, max, step, get, set, format }
// Objects provide tabs directly via getGuiSchema(): { tabs: [{ id, label, schema }] }
type ToggleEntry = {
    type: "toggle";
    key?: string;
    label?: string;
    get?: () => boolean;
    set?: (v: boolean) => void;
};

type SliderEntry = {
    type: "slider";
    key?: string;
    label?: string;
    min?: number;
    max?: number;
    step?: number;
    get?: () => number;
    set?: (v: number) => void;
};

type ReadonlyEntry = {
    type: "readonly";
    key?: string;
    label?: string;
    get?: () => unknown;
    format?: (v: unknown) => string;
};

type ObjectSelectEntry<Traits extends Trait[], T = TraitTupleToInstanceIntersection<Traits>> = Traits extends infer R ? {
    type: "object-select";
    key?: string;
    label?: string;
    traits: [...Traits];
    filter?: (object: Traits) => boolean;
    get?: () => T | undefined;
    set?: (object: T) => void;
} : never;

type ColorEntry = {
    type: "color";
    key?: string;
    label?: string;
    get?: () => string;
    set?: (v: string) => void;
};

type VectorEntry = {
    type: "vector";
    key?: string;
    label?: string;
    get?: () => Vector2 | Vector3 | Vector4;
    set?: (v: Vector2 | Vector3 | Vector4) => void;
};

type FolderEntry = {
    type: "folder";
    key?: string;
    label?: string;
    schema?: GuiSchemaEntry[];
};

type GuiSchemaEntry =
    | ToggleEntry
    | SliderEntry
    | ReadonlyEntry
    | ObjectSelectEntry<any>
    | ColorEntry
    | FolderEntry
    | VectorEntry
    ;

type GuiTab = {
    id: string;
    label: string;
    schema: GuiSchemaEntry[];
};

export type GuiTabs = { tabs: GuiTab[] };

type ControlRecord = {
    controller?: { dispose?: () => void; refresh?: () => void } | null;
    get?: () => unknown;
    set?: (v: unknown) => void;
    state: { value: unknown };
};

export default class GuiManager {
    globalsContainer: HTMLDivElement;
    objectsContainer: HTMLDivElement;
    globalsPane: Pane;
    objectsPane: Pane;
    currentObjectId: string | null;
    objectControls: ControlRecord[];
    globalsControls: ControlRecord[];
    objectsRegistry: ObjectsRegistry;
    selectorBinding: any;
    filterBinding: any;
    propertyFilters: Record<string, string>;
    filterDebounceId: number | null;
    tabView: any;

    constructor() {
        this.globalsContainer = document.createElement("div");
        this.globalsContainer.style.position = "fixed";
        this.globalsContainer.style.left = "12px";
        this.globalsContainer.style.top = "12px";
        this.globalsContainer.style.zIndex = "10";
        this.globalsContainer.style.width = "400px";
        document.body.appendChild(this.globalsContainer);

        this.objectsContainer = document.createElement("div");
        this.objectsContainer.style.position = "fixed";
        this.objectsContainer.style.right = "12px";
        this.objectsContainer.style.top = "12px";
        this.objectsContainer.style.zIndex = "10";
        this.objectsContainer.style.width = "400px";
        document.body.appendChild(this.objectsContainer);

        this.globalsPane = new Pane({
            title: "Globals",
            container: this.globalsContainer,
        });
        this.objectsPane = new Pane({
            title: "Objects",
            container: this.objectsContainer,
        });
        this.currentObjectId = null;
        this.objectControls = [];
        this.globalsControls = [];
        this.selectorBinding = null;
        this.filterBinding = null;
        this.propertyFilters = {};
        this.filterDebounceId = null;
        this.tabView = null;
    }

    isReady(): boolean {
        return !!this.globalsPane && !!this.objectsPane;
    }

    setGlobalsSchema(schema: GuiSchemaEntry[] = []): void {
        if (!this.globalsPane) return;
        this.globalsControls.forEach((c) => c.controller?.dispose?.());
        this.globalsControls = [];
        this.buildControls(this.globalsPane, schema, this.globalsControls);
    }

    setObjectsRegistry(objectsRegistry: ObjectsRegistry): void {
        if (!this.objectsPane) return;
        this.objectsRegistry = objectsRegistry;
        if (this.selectorBinding) {
            this.selectorBinding.dispose();
            this.selectorBinding = null;
        }
        if (this.tabView) {
            this.tabView.dispose();
            this.tabView = null;
        }


        const filtered = this.objectsRegistry.getObjectsByTraits(GuiConfigurable);

        const state = { selected: this.objectsRegistry.getObjectId(filtered[0]) ?? null };


        const options = _.zipObject(_.map(filtered, o => this.objectsRegistry.getObjectLabel(o)), _.map(filtered, o => this.objectsRegistry.getObjectId(o)));

        console.log("Object options:", options);
        if (filtered.length > 0) {
            this.selectorBinding = this.objectsPane
                .addBinding(state, "selected", { label: "Select object", options })
                .on("change", (ev: { value: string | null }) => {
                    this.currentObjectId = ev.value ?? null;
                    this.rebuildObjectFolder();
                });

            this.currentObjectId = state.selected;
            this.rebuildObjectFolder();
        }
    }

    refresh(): void {
        if (!this.objectsPane) return;
        const apply = (controls: ControlRecord[]) => {
            controls.forEach((c) => {
                if (c.get && c.controller) {
                    c.state.value = c.get();
                    c.controller.refresh?.();
                }
            });
        };
        apply(this.globalsControls);
        apply(this.objectControls);
    }

    private buildObjectControls(objectId: string): void {
        if (!this.objectsPane) return;
        if (this.tabView) {
            this.tabView.dispose();
            this.tabView = null;
        }
        this.objectControls.forEach((c) => c.controller?.dispose());
        this.objectControls = [];

        const obj = this.objectsRegistry.getObjectById(objectId) as GuiConfigurable | null;
        if (!obj) return;

        const schema = obj.getGuiSchema();
        const tabs = schema?.tabs ?? [];
        console.log("Building GUI for object:", objectId, obj, tabs);
        const filterText = (this.propertyFilters[objectId] ?? "").trim();
        const filterState = { value: this.propertyFilters[objectId] ?? "" };
        if (this.filterBinding) {
            this.filterBinding.dispose();
            this.filterBinding = null;
        }
        this.filterBinding = this.objectsPane
            .addBinding(filterState, "value", { label: "Properties filter" })
            .on("change", (ev: { value: string }) => {
                if (this.filterDebounceId !== null) {
                    clearTimeout(this.filterDebounceId);
                }
                this.filterDebounceId = window.setTimeout(() => {
                    this.propertyFilters[objectId] = ev.value ?? "";
                    this.filterDebounceId = null;
                    this.rebuildObjectFolder();
                }, 150);
            });

        const filteredTabs = this.filterTabs(tabs, filterText);
        if (filteredTabs.length === 0) return;

        this.tabView = this.objectsPane.addTab({
            pages: filteredTabs.map((t) => ({ title: t.label })),
        });
        filteredTabs.forEach((tab, idx) => {
            const page = this.tabView.pages[idx];
            this.buildControls(page, tab.schema ?? [], this.objectControls);
        });
    }

    private rebuildObjectFolder(): void {
        if (!this.objectsPane) return;
        if (this.tabView) {
            this.tabView.dispose();
            this.tabView = null;
        }
        if (!this.currentObjectId) return;
        const obj = this.objectsRegistry.getObjectById(this.currentObjectId);
        console.log("Rebuilding GUI for object:", this.currentObjectId, obj);
        if (!obj) return;
        this.buildObjectControls(this.currentObjectId);
    }

    private filterTabs(tabs: GuiTab[], filterText: string): GuiTab[] {
        if (!filterText) return tabs;
        const needle = filterText.toLowerCase();
        return tabs
            .map((tab) => {
                const filteredSchema = this.filterSchema(tab.schema ?? [], needle);
                return { ...tab, schema: filteredSchema };
            })
            .filter((tab) => tab.schema.length > 0);
    }

    private filterSchema(schema: GuiSchemaEntry[], needle: string): GuiSchemaEntry[] {
        if (!needle) return schema;
        const matches = (entry: GuiSchemaEntry) => {
            const text = `${(entry as any).label ?? ""} ${(entry as any).key ?? ""}`.toLowerCase();
            return text.includes(needle);
        };
        const out: GuiSchemaEntry[] = [];
        schema.forEach((entry) => {
            if (entry.type === "folder") {
                const nested = this.filterSchema(entry.schema ?? [], needle);
                if (nested.length > 0 || matches(entry)) {
                    out.push({ ...entry, schema: nested });
                }
            } else if (matches(entry)) {
                out.push(entry);
            }
        });
        return out;
    }

    formatNumber(value: unknown): string {
        if (typeof value === "number") {
            const absValue = Math.abs(value);
            if (absValue >= 1e3 || absValue <= 1e-3 && value !== 0) {
                return value.toExponential(3);
            } else {
                return value.toPrecision(4);
            }
        }
        return value?.toString() ?? "";
    }

    private buildControls(
        folder: FolderApi,
        schema: GuiSchemaEntry[],
        store: ControlRecord[]
    ): void {
        schema.forEach((entry) => {
            const { label, type, min, max, step, get, set, filter, traits } = entry as any;

            const state = { value: get ? get() : undefined };
            let controller: any = null;
            if (type === "vector") {
                controller = folder.addBinding(state, "value", { label });
            }
            else if (type === "toggle") {
                controller = folder
                    .addBinding(state, "value", { label })
                    .on("change", (ev: { value: unknown }) => set && set(!!ev.value));
            } else if (type === "slider") {
                controller = folder
                    .addBinding(state, "value", { label, min, max, step })
                    .on("change", (ev: { value: number }) => set && set(ev.value));
            } else if (type === "readonly") {
                const bindingOpts: Record<string, unknown> = { label, readonly: true, format: this.formatNumber };

                controller = folder.addBinding(state, "value", bindingOpts);
            } else if (type === "object-select") {
                const filtered = this.objectsRegistry.getObjectsByTraits.apply(this.objectsRegistry, traits);
                const valueObject = state.value;

                state.value = this.objectsRegistry.getObjectId(get());

                console.log('Get() valueObject:', valueObject, state.value);
                const options = _.zipObject(_.map(filtered, o => this.objectsRegistry.getObjectLabel(o)), _.map(filtered, o => this.objectsRegistry.getObjectId(o)));

                if (_.keys(options).length === 0) return;
                if (!state.value || !Object.values(options).includes(state.value as string)) {
                    state.value = this.objectsRegistry.getObjectId(Object.values(options)[0]);
                }
                controller = folder
                    .addBinding(state, "value", { label, options })
                    .on("change", (ev: { value: string }) => set && (console.log("Object-select changed:", ev.value), set(this.objectsRegistry.getObjectById(ev.value))));
                store.push({ controller, get: () => this.objectsRegistry.getObjectId(get()), set, state });
                return;
            } else if (type === "color") {
                controller = folder
                    .addBinding(state, "value", { label, view: "color" })
                    .on("change", (ev: { value: string }) => set && set(ev.value));
            } else if (type === "folder") {
                const childFolder = folder.addFolder({ title: label });
                this.buildControls(childFolder, (entry as FolderEntry).schema ?? [], store);
            }
            store.push({ controller, get, set, state });
        });
    }
}
