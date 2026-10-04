// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0

/** Retry policy applied by a resolver when `load()` fails. */
export interface RetryPolicy {
    maxAttempts: number;
    /** Initial delay in seconds. */
    delay: number;
    backoff: number;
    jitter: boolean;
    /** Error names that trigger a retry. */
    on: string[];
}

/** Predefined retry policies, referenced by name in `retryPolicy`. */
export const RETRY_POLICIES: {
    network: RetryPolicy;
    aggressive: RetryPolicy;
    gentle: RetryPolicy;
};

/** Options shared by every resolver. */
export interface BagResolverOptions {
    /** Cache duration in ms. 0 disables the cache, a negative value never expires. */
    cacheTime?: number;
    /** If true, the resolved value is not stored in the node. */
    readOnly?: boolean;
    /** If true, the result is converted to a Bag. */
    asBag?: boolean | null;
    retryPolicy?: RetryPolicy | keyof typeof RETRY_POLICIES | null;
    [key: string]: any;
}

/** Position of a node in a Bag: '>', '<', '#n', '<label', '>label' or an index. */
export type NodePosition = string | number | null;

/** Callback of `Bag.forEach`: receives the node, the context and the sibling index. */
export type ForEachCallback = (node: BagNode, kwargs: Record<string, any>, index: number) => any;

/** Callbacks accepted by `Bag.subscribe`. */
export interface BagSubscriptionCallbacks {
    update?: ((...args: any[]) => void) | null;
    insert?: ((...args: any[]) => void) | null;
    delete?: ((...args: any[]) => void) | null;
    any?: ((...args: any[]) => void) | null;
}

/** Options of `Bag.toXml`. */
export interface ToXmlOptions {
    pretty?: boolean;
    encoding?: string;
    docHeader?: boolean | string | null;
    selfClosedTags?: string[] | null;
}

/** Options of `Bag.fromXml`. */
export interface FromXmlOptions {
    tagAttribute?: string | null;
}

/** Options of `Bag.fromUrl`. */
export interface FromUrlOptions {
    /** Timeout in seconds. */
    timeout?: number;
    [key: string]: any;
}

/** Options of `Bag.forEach`. */
export interface ForEachOptions {
    static?: boolean;
    deep?: boolean;
    kwargs?: Record<string, any>;
}

/** Error raised for Bag-specific failures. */
export class BagException extends Error {
    constructor(message: string);
}

/** Error raised when a resolver cannot be serialized or executed locally. */
export class BagSerializationError extends Error {
    constructor(message: string);
}

/** Ordered container of BagNodes, addressed by label, index or dotted path. */
export class Bag implements Iterable<BagNode> {
    /** Wire suffix of the base class in the TYTX registry. */
    static tytxSuffix: string;
    constructor(source?: Record<string, any> | Bag | null);

    parent: Bag | null;
    parentNode: BagNode | null;
    readonly backref: boolean;
    readonly nodeClass: typeof BagNode;
    readonly fullpath: string | null;
    readonly length: number;
    readonly root: Bag;
    readonly attributes: Record<string, any>;
    rootAttributes: Record<string, any> | null;
    readonly nodes: BagNode[];

    createChildBag(): Bag;
    relativePath(node: BagNode): string | null;

    get(label: string | number, defaultValue?: any, isStatic?: boolean, kwargs?: Record<string, any>): any;
    getItem(path: string, defaultValue?: any, isStatic?: boolean, kwargs?: Record<string, any>): any;
    setItem(path: string, value: any, attr?: Record<string, any> | null, nodePosition?: NodePosition,
            updattr?: boolean, removeNullAttributes?: boolean, reason?: string | null, fired?: boolean,
            doTrigger?: boolean, resolver?: BagResolver | false | null, nodeTag?: string | null): BagNode;
    pop(path: string, defaultValue?: any, reason?: string | null): any;
    delItem(path: string, defaultValue?: any, reason?: string | null): any;
    popNode(path: string, reason?: string | null): BagNode | null;
    clear(): void;
    getNode(path: string | number, isStatic?: boolean, autocreate?: boolean, defaultValue?: any): BagNode | null;
    node(key: string | number): BagNode | null;
    setdefault(path: string, defaultVal?: any): any;
    has(what: string): boolean;

    setBackref(node?: BagNode | null, parent?: Bag | null): void;
    delParentRef(): void;
    clearBackref(): void;
    subscribe(subscriberId: string, callbacks?: BagSubscriptionCallbacks): void;
    unsubscribe(subscriberId: string, options?: { update?: boolean; insert?: boolean; delete?: boolean; any?: boolean }): void;

    keys(): string[];
    values(): any[];
    items(): Array<[string, any]>;
    [Symbol.iterator](): Iterator<BagNode>;

    setAttr(path?: string | null, attr?: Record<string, any> | null, removeNullAttributes?: boolean): void;
    getAttr(path?: string | null, attr?: string | null, defaultVal?: any): any;
    delAttr(path?: string | null, ...attrs: string[]): void;
    getInheritedAttributes(): Record<string, any>;

    getNodes(condition?: ((node: BagNode) => boolean) | null): BagNode[];
    getNodeByValue(key: string, value: any): BagNode | null;
    getNodeByAttr(attr: string, value: any, caseInsensitive?: boolean, deep_first?: boolean): BagNode | null;
    isEmpty(zeroIsNone?: boolean, blankIsNone?: boolean): boolean;
    query(what?: string | ((node: BagNode) => any) | null, condition?: ((node: BagNode) => boolean) | boolean | null,
          iter?: boolean, deep?: boolean, leaf?: boolean, branch?: boolean, limit?: number | null,
          isStatic?: boolean): any[] | Generator<any>;
    getLeaves(): Array<[string, any]>;
    digest(what?: string | null, condition?: ((node: BagNode) => boolean) | null, asColumns?: boolean): any[];
    columns(cols: string | string[], attrMode?: boolean): any[][];
    sum(what?: string, strict?: boolean, condition?: ((node: BagNode) => boolean) | null): number | null;
    sort(key?: string | ((node: BagNode) => any)): this;
    equalTo(other: any): boolean;

    getResolver(path: string): BagResolver | null;
    setResolver(path: string, resolver: BagResolver | null): void;
    setCallbackItem(path: string, callback: (kwargs: Record<string, any>) => any, options?: BagResolverOptions): void;

    move(what: number | number[], position: number, trigger?: boolean): void;
    asDict(ascii?: boolean, lower?: boolean, recursive?: boolean, excludeNullValues?: boolean): Record<string, any>;
    deepcopy(resolve?: boolean): Bag;
    update(source: Bag | Record<string, any>, mode?: string | null, reason?: string | null, ignoreNone?: boolean): void;
    replace(other: Bag): void;
    forEach(callback: ForEachCallback, options?: ForEachOptions): any;
    traverse(): Generator<BagNode>;

    toTytx(transport?: 'json' | 'msgpack', compact?: boolean): string | Uint8Array;
    static fromTytx(data: string | Uint8Array, transport?: 'json' | 'msgpack'): Bag;
    toXml(options?: ToXmlOptions): string;
    static fromXml(source: string, options?: FromXmlOptions): Bag;
    static fromUrl(url: string, options?: FromUrlOptions): Promise<Bag>;
    toJson(typed?: boolean): string;
    static fromJson(source: string | Record<string, any> | any[], listJoiner?: string | null): Bag;
    toStringTree(isStatic?: boolean): string;
    toString(isStatic?: boolean): string;
}

/** A labelled element of a Bag, holding a value, attributes and an optional resolver. */
export class BagNode {
    constructor(parentBag: Bag | null, label: string, value?: any, attr?: Record<string, any> | null,
                resolver?: BagResolver | null, nodeTag?: string | null, xmlTag?: string | null,
                removeNullAttributes?: boolean);
    label: string;
    nodeTag: string | null;
    xmlTag: string | null;
    parentBag: Bag | null;
    value: any;
    staticValue: any;
    resolver: BagResolver | null;
    readonly attr: Record<string, any>;
    readonly compiled: any;
    readonly isBranch: boolean;
    readonly position: number;
    readonly fullpath: string | null;
    readonly parentNode: BagNode | null;

    getValue(isStatic?: boolean, queryString?: string | null, kwargs?: Record<string, any>): any;
    replace(other: BagNode): void;
    resetResolver(): void;
    getAttr(label?: string | null, defaultValue?: any): any;
    setAttr(attr?: Record<string, any> | null, trigger?: boolean, updattr?: boolean, removeNullAttributes?: boolean): void;
    delAttr(...attrsToDelete: string[]): void;
    hasAttr(label: string, value?: any): boolean;
    getInheritedAttributes(): Record<string, any>;
    subscribe(subscriberId: string, callback: (...args: any[]) => void): void;
    unsubscribe(subscriberId: string): void;
    attributeOwnerNode(attrname: string, attrvalue?: any): BagNode | null;
    asTuple(): [string, any, Record<string, any>, BagResolver | null];
    isEqual(other: any): boolean;
    diff(other: BagNode): string | null;
    toJson(typed?: boolean): string;
    toString(): string;
}

/** Ordered storage of the nodes of a Bag, addressable by label, index or position. */
export class BagNodeContainer implements Iterable<BagNode> {
    constructor();
    readonly length: number;
    index(label: string): number;
    get(key: string | number): BagNode | null;
    pop(key: string | number): BagNode | null;
    has(key: string | number): boolean;
    clear(): void;
    keys(): string[];
    values(): any[];
    items(): Array<[string, any]>;
    move(what: number | number[], position: number, trigger?: boolean): void;
    isEqual(other: any): boolean;
    [Symbol.iterator](): Iterator<BagNode>;
}

/** Base class of lazy and cached value providers attached to a BagNode. */
export class BagResolver {
    static classKwargs: Record<string, any>;
    static classArgs: string[];
    static internalParams: Set<string>;
    /** Registers the Bag class used for `asBag` conversion. */
    static registerBagClass(BagClass: typeof Bag): void;

    constructor(kwargs?: BagResolverOptions);
    cacheTime: number;
    readonly readOnly: boolean;
    readonly expired: boolean;
    cachedValue: any;
    readonly node: BagNode | null;

    init(): void;
    setNode(node: BagNode | null): void;
    onSetResolver(node: BagNode): void;
    reset(): void;
    resolve(options?: { static?: boolean; [key: string]: any }): any;
    load(kwargs?: Record<string, any>): any;
}

/** Resolver that computes its value with a callback. */
export class BagCbResolver extends BagResolver {
    constructor(kwargs?: BagResolverOptions & { callback?: ((kwargs: Record<string, any>) => any) | null } | ((kwargs: Record<string, any>) => any));
    load(kwargs?: Record<string, any>): any;
}

/** Resolver that fetches a URL. */
export class UrlResolver extends BagResolver {
    constructor(urlOrKwargs?: string | (BagResolverOptions & {
        url?: string | null;
        method?: string;
        qs?: Record<string, any> | null;
        body?: any;
        /** Timeout in seconds. */
        timeout?: number;
        transport?: string;
    }), kwargs?: BagResolverOptions);
    load(kwargs?: Record<string, any>): Promise<any>;
}

/** Resolver that reads a value from localStorage or sessionStorage. */
export class StorageResolver extends BagResolver {
    constructor(keyOrKwargs?: string | (BagResolverOptions & {
        key?: string | null;
        storageType?: 'local' | 'session';
        defaultValue?: any;
        dtype?: string | null;
    }), kwargs?: BagResolverOptions);
    load(kwargs?: Record<string, any>): any;
}

/** Resolver that generates a UUID. */
export class UuidResolver extends BagResolver {
    constructor(kwargs?: BagResolverOptions & { version?: string });
    load(): string;
}

/** A server resolver description that can travel on the wire but cannot execute locally. */
export class OpaqueResolver extends BagResolver {
    constructor(payload: any);
    readonly payload: any;
    load(): never;
}

/** Wire adapters of a resolver class registered for a Python module/class pair. */
export interface ResolverRegistration {
    module: string;
    name: string;
    encode: (resolver: any) => { args: any[]; kwargs: Record<string, any> };
    decode: (data: { args: any[]; kwargs: Record<string, any> }) => BagResolver;
}

/** Register a JS counterpart for a Python module/class pair. */
export function registerResolver(cls: new (...args: any[]) => BagResolver, registration: ResolverRegistration): void;
