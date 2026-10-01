# genro-bag-js

TypeScript/JavaScript port of [genro-bag](https://github.com/nicofirst1/genro-bag) - hierarchical data container with XML serialization, Builder pattern, and Compiler system.

## Status

**Development Status**: Pre-Alpha (documentation and planning)

## Overview

genro-bag-js brings the Python genro-bag architecture to JavaScript/TypeScript for:

- **Browser**: DOM manipulation, UI frameworks, reactive updates
- **Node.js**: Server-side processing, CLI tools
- **Interoperability**: Same XML/JSON format as Python version
- **Modern runtimes**: Deno, Bun support

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         SERVER (Python)                         │
│                                                                 │
│   Builder Python → creates "recipe" (structured Bag)           │
│   bag.to_xml() → serializes for transport                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼  (HTTP / WebSocket)
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (JavaScript)                     │
│                                                                 │
│   Bag.fromXml() → reconstructs structure                       │
│   Expander → expands macros/components (optional)              │
│   DOMCompiler → builds DOM/widgets dynamically                 │
└─────────────────────────────────────────────────────────────────┘
```

## Core Classes

| Class | Description |
|-------|-------------|
| `Bag` | Hierarchical container with labeled nodes |
| `BagNode` | Individual node with value and attributes |
| `BagBuilderBase` | Base class for declarative structure builders |
| `BagCompilerBase` | Base class for output generators (DOM, HTML, etc.) |
| `BagResolver` | Lazy loading support |

## Installation

The same package is published on two registries:

```bash
# npm
npm install @genrojs/bag

# JSR
npx jsr add @genro/bag
```

From npm, import from `@genrojs/bag`; from JSR, import from `@genro/bag`.

## Usage

```typescript
import { Bag } from '@genrojs/bag';

// Create a Bag
const bag = new Bag();
bag.set('config.name', 'My App');
bag.set('config.version', '1.0.0');

// Serialize
const xml = bag.toXml();
const json = bag.toJson();

// Parse
const restored = Bag.fromXml(xml);
```

### With Builder

```typescript
import { Bag, BagBuilderBase, element } from '@genrojs/bag';

class GUIBuilder extends BagBuilderBase {
  @element({ subTags: 'button,textfield' })
  panel(title: string) {}

  @element({ subTags: '' })
  button(label: string, action?: string) {}
}

const gui = new Bag({ builder: GUIBuilder });
const panel = gui.panel('Settings');
panel.button('Save', 'doSave');
panel.button('Cancel', 'doCancel');
```

### With Compiler

```typescript
import { BagCompilerBase, compiler } from '@genrojs/bag';

class DOMCompiler extends BagCompilerBase {
  @compiler
  panel(node, children): HTMLElement {
    const div = document.createElement('div');
    div.className = 'panel';
    children.forEach(child => div.appendChild(child));
    return div;
  }

  @compiler
  button(node, children): HTMLElement {
    const btn = document.createElement('button');
    btn.textContent = node.attr.label;
    btn.onclick = () => this.handleAction(node.attr.action);
    return btn;
  }
}
```

## Documentation

- [Python alignment and TYTX compatibility](docs/python-alignment.md)

- [Architecture Analysis](docs/analysis/analisi_bag_js_builder_js.md) - Detailed analysis of existing JS implementation
- [Plan](docs/plan.md) - Implementation roadmap

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build
pnpm build

# Type check
pnpm typecheck
```

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.

Copyright 2025 Softwell S.r.l.


## JSR distribution

The JavaScript package is published as `@genro/bag` on JSR. Use
`bunx jsr add @genro/bag` or `npx jsr add @genro/bag`.
Node.js 22+, Bun and modern browsers with Web Crypto are the supported targets.
TYTX is resolved from JSR; no GitHub package checkout is needed.

[![JSR](https://jsr.io/badges/@genro/bag)](https://jsr.io/@genro/bag)

Deno publication keeps a 24-hour cooldown for external dependencies and exempts
Genro JSR packages (`jsr:@genro/*` and their `npm:@jsr/genro__*` compatibility
names). Releases are published only to JSR; the npm form downloads from
`npm.jsr.io`, not npmjs.com. Verify each published dependency before adopting it.

### Optional developer HTML representation

The experimental inspector is a separate entry point, excluded from the main
module and browser bundle. It may be removed in a future release.

```js
import { htmlRepr } from '@genrojs/bag/devtools';
// With a bundler that supports CSS imports:
import '@genrojs/bag/devtools/html-repr.css';

const html = htmlRepr(bag, {title: 'Inspect Bag', showTypes: true});
```

Load the stylesheet separately when not using a CSS-aware bundler. The function
returns an escaped HTML fragment; rendering it requires no additional script.
Bag panels and attributes start collapsed. Options `openDepth` (default 0),
`openAttributes` (default false), `showTypes` (default true), and `className`
control presentation. The renderer reads static values without invoking
resolvers. An optional `resolverParameters(resolver)` hook supplies additional
metadata, including named callbacks; the hook must not execute the resolver.
Resolver badges use the constructor name, which minification may change.

All nodes are emitted even when collapsed: this is a static developer inspector,
not a virtualized viewer for large datasets. Ancestor cycles are marked without
mutating the Bag. The inspector is deliberately not installed on `Bag.prototype`.
