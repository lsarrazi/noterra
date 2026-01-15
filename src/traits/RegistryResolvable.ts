import { trait } from "../traits";

// Trait example pattern: call `RegistryResolvable.from(instance)` to project the trait.
export class RegistryResolvable {
    static from = trait(RegistryResolvable);

    getGuiSchema() { }

    getRegistryConfig(): { id: string; label: string } {
        return { id: 'no-id', label: '' };
    }
}

export type RegistryResolvableTrait = ReturnType<typeof RegistryResolvable.from>;
