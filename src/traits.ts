
type AnyFn = ((...args: any[]) => any) | undefined;

type Concrete<Type> = {
    [Property in keyof Type]-?: Type[Property];
};

type PickMethods<T> = Pick<T, {
    [K in keyof T]-?: T[K] extends AnyFn ? K : never
}[keyof T]>;

type PickProps<T> = Pick<T, {
    [K in keyof T]: T[K] extends AnyFn ? never : K
}[keyof T]>;

type Stateless<T> = Concrete<PickMethods<T>> & Partial<PickProps<T>>;
type Stateful<T> = Concrete<T>;

/** 
@example

```ts
class MyTrait {
    static from = trait(MyTrait);

    myMethod() {
        console.log("Hello from MyTrait");
    }

    aDefaultMethod?() {
        this.myMethod();
    }
}

class MyClass implements MyTrait {
    myMethod() {
        console.log("Hello from MyClass");
    }
}

const myInstance = new MyClass();
const myTrait = MyTrait.from(myInstance);

myTrait.myMethod(); // Hello from MyClass
myTrait.aDefaultMethod(); // Hello from MyClass
```
*/
export function trait<T extends object, StatefulOption extends boolean, C extends any[]>(
    traitConstructor: (StatefulOption extends true ? new (...args: [...C]) => T : new () => T),
    opts?: { stateful?: StatefulOption }
) {
    const gettersKeys: (string | symbol)[] = Object.entries(Object.getOwnPropertyDescriptors(traitConstructor.prototype)).filter(([k, o]) => o.get).map(([k]) => k);

    const keys: (string | symbol)[] = [
        ...Object.getOwnPropertyNames(traitConstructor.prototype),
        ...Object.getOwnPropertySymbols(traitConstructor.prototype),
    ].filter(k => k !== "constructor" && !gettersKeys.includes(k));

    const stateless = !(opts?.stateful ?? false);
    const weakMap = stateless ? new WeakMap<T>() : undefined;

    return (instance: T, ...args: [...C]): StatefulOption extends true ? Stateful<T> : Stateless<T> => {
        const cached = stateless ? weakMap!.get(instance) : undefined;
        if (cached) return cached;

        const traitImpl = stateless ? Object.create(traitConstructor.prototype) : new traitConstructor(...args);

        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const value = instance[key];
            if (typeof value === "function")
                traitImpl[key] = value.bind(instance);
        }

        for (let i = 0; i < gettersKeys.length; i++) {
            const getterKey = gettersKeys[i];
            const getter = instance.__lookupGetter__(getterKey);
            const setter = instance.__lookupSetter__(getterKey);

            if (getter !== undefined)
                traitImpl.__defineGetter__(getterKey, getter.bind(instance));
            if (setter !== undefined)
                traitImpl.__defineSetter__(getterKey, setter.bind(instance));
        }

        if (stateless) {
            Object.freeze(traitImpl);
            weakMap!.set(instance, traitImpl);
        }

        return traitImpl as any;
    };
}

export type Trait = new () => any