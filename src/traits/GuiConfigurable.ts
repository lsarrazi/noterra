import { trait } from "../traits";
import { GuiTabs } from "../ui/GuiManager";

// Trait example pattern: call `RegistryResolvable.from(instance)` to project the trait.
export class GuiConfigurable {
    static from = trait(GuiConfigurable);

    getGuiSchema(): GuiTabs {
        return { tabs: [] };
    }
}

export type GuiConfigurableTraitView = ReturnType<typeof GuiConfigurable.from>;
