import { Pane } from "tweakpane";

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

type ObjectSelectEntry = {
    type: "object-select";
    key?: string;
    label?: string;
    filter?: (o: GuiObject) => boolean;
    get?: () => string | null | undefined;
    set?: (v: string | null | undefined) => void;
};

type ColorEntry = {
    type: "color";
    key?: string;
    label?: string;
    get?: () => string;
    set?: (v: string) => void;
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
    | ObjectSelectEntry
    | ColorEntry
    | FolderEntry;

type GuiTab = {
    id: string;
    label: string;
    schema: GuiSchemaEntry[];
};

type GuiTabs = { tabs: GuiTab[] };

type GuiObject = {
    id: string;
    label: string;
    getGuiSchema?: () => GuiTabs | null | undefined;
};

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
    objectsRegistry: GuiObject[];
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
        document.body.appendChild(this.globalsContainer);

        this.objectsContainer = document.createElement("div");
        this.objectsContainer.style.position = "fixed";
        this.objectsContainer.style.right = "12px";
        this.objectsContainer.style.top = "12px";
        this.objectsContainer.style.zIndex = "10";
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
        this.objectsRegistry = [];
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

    setObjectsRegistry(objects: GuiObject[] = []): void {
        if (!this.objectsPane) return;
        this.objectsRegistry = objects;
        if (this.selectorBinding) {
            this.selectorBinding.dispose();
            this.selectorBinding = null;
        }
        if (this.tabView) {
            this.tabView.dispose();
            this.tabView = null;
        }

        const state = { selected: objects[0]?.id ?? null };

        const options = objects.reduce<Record<string, string>>((acc, obj) => {
            acc[obj.label] = obj.id;
            return acc;
        }, {});

        if (objects.length > 0) {
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

        const obj = this.objectsRegistry.find((o) => o.id === objectId);
        if (!obj) return;

        const schema = obj.getGuiSchema ? obj.getGuiSchema() : null;
        const tabs = schema?.tabs ?? [];
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
        const obj = this.objectsRegistry.find((o) => o.id === this.currentObjectId);
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

    private buildControls(
        folder: any,
        schema: GuiSchemaEntry[],
        store: ControlRecord[]
    ): void {
        schema.forEach((entry) => {
            const { label, type, min, max, step, get, set, format, filter } = entry as any;
            const state = { value: get ? get() : undefined };
            let controller: any = null;
            if (type === "toggle") {
                controller = folder
                    .addBinding(state, "value", { label })
                    .on("change", (ev: { value: unknown }) => set && set(!!ev.value));
            } else if (type === "slider") {
                controller = folder
                    .addBinding(state, "value", { label, min, max, step })
                    .on("change", (ev: { value: number }) => set && set(ev.value));
            } else if (type === "readonly") {
                const bindingOpts: Record<string, unknown> = { label, readonly: true };
                if (format) bindingOpts.format = format;
                controller = folder.addBinding(state, "value", bindingOpts);
            } else if (type === "object-select") {
                const filtered = this.objectsRegistry.filter((o) =>
                    typeof filter === "function" ? filter(o) : true
                );
                const options = filtered.reduce<Record<string, string>>((acc, obj) => {
                    acc[obj.label] = obj.id;
                    return acc;
                }, {});
                if (Object.keys(options).length === 0) return;
                if (!state.value || !Object.values(options).includes(state.value as string)) {
                    state.value = Object.values(options)[0];
                }
                controller = folder
                    .addBinding(state, "value", { label, options })
                    .on("change", (ev: { value: string }) => set && set(ev.value));
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
