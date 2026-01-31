import { Trait } from "../traits";

export type RegistryObject = {
    label: string;
    object: any;
    traits: Trait[];
}

export type TraitTupleToInstanceIntersection<T extends readonly unknown[]> =
    T extends readonly [infer Head, ...infer Tail]
    ? InstanceType<Head> & TraitTupleToInstanceIntersection<Tail>
    : unknown;

export class ObjectsRegistry {
    private registry: Map<string, RegistryObject> = new Map();
    private invertRegistry: Map<any, string> = new Map();
    private traitsRegistry: Map<Trait, { objects: Set<RegistryObject>, description?: string }> = new Map();

    register(entry: RegistryObject): void {
        const id = // Generate a simple unique ID based on the label
            entry.label.toLowerCase().normalize('NFD').replace(/\s+/g, "-") +
            "-" +
            crypto.randomUUID();

        for (const trait of entry.traits) {
            const registry = this.traitsRegistry.get(trait);

            if (!registry) {
                throw new Error(`Trait not registered in traitsRegistry: ${trait.name}`);
            }

            registry.objects.add(entry);
        }

        this.registry.set(id, entry);
        this.invertRegistry.set(entry.object, id);
    }

    registerTrait({ trait, description }: { trait: Trait, description?: string }): void {
        if (this.traitsRegistry.has(trait)) {
            throw new Error(`Trait already registered: ${trait.name}`);
        }

        this.traitsRegistry.set(trait, { objects: new Set, description });
    }

    getObjectById(id: string): unknown | null {
        return this.registry.get(id)?.object ?? null;
    }

    getObjectsByTraits<T extends any[]>(...traits: [...T]): TraitTupleToInstanceIntersection<T>[] {
        const sets = traits.map(trait => { const objects = this.traitsRegistry.get(trait)?.objects; if (!objects) throw new Error(`Trait not registered: ${trait.name}`); return objects; });

        sets.sort((a, b) => a.size - b.size);

        // Make it loop through the smallest set and check if the object is in all other sets, starting with the biggest set (to reduce the number of checks)

        // like sets[0].filter(o => sets[last].has(o) && sets[secondLast].has(o) ... )

        let result = [];

        for (const obj of sets[0]) {
            let foundInAll = true;
            for (let i = sets.length - 1; i >= 1; i--) {
                if (!sets[i].has(obj)) {
                    foundInAll = false;
                    break;
                }
            }

            if (foundInAll) {
                result.push(obj.object);
            }
        }

        return result;
    }

    getObjectId(object: any): string | null {
        return this.invertRegistry.get(object) ?? null;
    }

    getObjectLabel(object: any): string | null {
        const id = this.invertRegistry.get(object);
        if (!id) return null;
        return this.registry.get(id)?.label ?? null;
    }
}