# Methods Tracking - Python to JavaScript Port

## Legenda

- ✅ Implementato
- ⏳ Da implementare
- 🔄 Implementazione diversa (async/JS specifico)
- ❌ Non applicabile in JS
- 📝 Note

---

## BagNode

| Metodo Python | Metodo JS | Status | Note |
|---------------|-----------|--------|------|
| `__init__` | `constructor` | ✅ | Minimo: label, value, attr |
| `__eq__` | `equalTo` | ✅ | |
| `__ne__` | - | ❌ | Usare `!equalTo()` |
| `__str__` | `toString` | ✅ | |
| `__repr__` | - | ⏳ | |
| `__getattr__` | - | ⏳ | Per builder delegation |
| **Properties** | | | |
| `parent_bag` | `parentBag` | ✅ | getter/setter |
| `_` | `_` | ⏳ | Return parent for chaining |
| `value` | `value` | ✅ | getter/setter |
| `static_value` | `staticValue` | ✅ | getter/setter |
| `resolver` | `resolver` | ⏳ | Per resolver support |
| `compiled` | `compiled` | ⏳ | Per builder support |
| `attr` | `attr` | ✅ | getter |
| `position` | `position` | ✅ | getter |
| `fullpath` | `fullpath` | ✅ | getter |
| `parent_node` | `parentNode` | ✅ | getter |
| `is_valid` | `isValid` | ⏳ | |
| `is_branch` | `isBranch` | ⏳ | |
| **Methods** | | | |
| `get_value` | `getValue` | ✅ | Con queryString support |
| `set_value` | `setValue` | ✅ | Con attributes, updattr, removeNull |
| `reset_resolver` | `resetResolver` | ⏳ | |
| `get_attr` | `getAttr` | ✅ | |
| `set_attr` | `setAttr` | ✅ | Con updattr, removeNullAttributes |
| `del_attr` | `delAttr` | ✅ | Supporta comma-separated |
| `has_attr` | `hasAttr` | ✅ | Con value check opzionale |
| `get_inherited_attributes` | `getInheritedAttributes` | ✅ | |
| `attribute_owner_node` | `attributeOwnerNode` | ✅ | |
| `subscribe` | `subscribe` | ✅ | Node-level subscription |
| `unsubscribe` | `unsubscribe` | ✅ | |
| `diff` | `diff` | ⏳ | |
| `as_tuple` | `asTuple` | ✅ | |
| `to_json` | `toJson` | ⏳ | |

---

## BagNodeContainer ✅ COMPLETO

| Metodo Python | Metodo JS | Status | Note |
|---------------|-----------|--------|------|
| `__init__` | `constructor` | ✅ | |
| `__getitem__` | `get` | ✅ | JS non ha `[]` overload |
| `__setitem__` | - | ❌ | Usare `set()` |
| `__delitem__` | - | ❌ | Usare `pop()` |
| `__contains__` | `has` | ✅ | |
| `__len__` | `length` | ✅ | getter |
| `__iter__` | `[Symbol.iterator]` | ✅ | |
| `__eq__` | `isEqual` | ✅ | |
| **Methods** | | | |
| `index` | `index` | ✅ | Supporta label, #n, #attr=value, #=value |
| `_parse_position` | `_parsePosition` | ✅ | |
| `get` | `get` | ✅ | |
| `set` | `set` | ✅ | Minimo, senza resolver/trigger |
| `pop` | `pop` | ✅ | |
| `move` | `move` | ✅ | |
| `clear` | `clear` | ✅ | |
| `keys` | `keys` | ✅ | |
| `values` | `values` | ✅ | |
| `items` | `items` | ✅ | |

---

## Bag

| Metodo Python | Metodo JS | Status | Note |
|---------------|-----------|--------|------|
| `__init__` | `constructor` | ✅ | Minimo, senza source/builder |
| `__str__` | `toString` | ✅ | |
| `__iter__` | `[Symbol.iterator]` | ✅ | |
| `__len__` | `length` | ✅ | getter |
| `__contains__` | `has` | ⏳ | |
| `__call__` | - | ❌ | JS non supporta callable objects |
| `__eq__` | - | ⏳ | |
| `__ne__` | - | ⏳ | |
| `__getitem__` | - | ❌ | Usare `getItem()` |
| `__setitem__` | - | ❌ | Usare `setItem()` |
| `__delitem__` | - | ❌ | Usare `pop()` |
| `__getstate__` | - | ❌ | Pickle specifico Python |
| `__setstate__` | - | ❌ | Pickle specifico Python |
| `__getattr__` | - | ⏳ | Per builder delegation (Proxy?) |
| **Properties** | | | |
| `parent` | `parent` | ✅ | getter/setter |
| `parent_node` | `parentNode` | ✅ | getter/setter |
| `backref` | `backref` | ✅ | getter |
| `fullpath` | `fullpath` | ✅ | getter |
| `root` | `root` | ⏳ | |
| `in_async_context` | - | ❌ | JS è sempre async-capable |
| `attributes` | `attributes` | ⏳ | |
| `root_attributes` | `rootAttributes` | ⏳ | |
| `builder` | `builder` | ⏳ | |
| `nodes` | `nodes` | ⏳ | |
| **Core Methods** | | | |
| `fill_from` | `fillFrom` | ⏳ | |
| `_fill_from_file` | - | 🔄 | Browser: fetch, Node: fs |
| `_fill_from_bag` | `_fillFromBag` | ⏳ | |
| `_fill_from_dict` | `_fillFromDict` | ⏳ | |
| `from_url` | `fromUrl` | ⏳ | Static, async |
| **Traversal** | | | |
| `_htraverse_before` | `_htraverseBefore` | ✅ | |
| `_htraverse` | `_htraverse` | ✅ | 🔄 Sync version, async TBD |
| `_traverse_inner` | - | 🔄 | Integrato in `_htraverse` |
| `_is_coroutine` | - | ❌ | JS usa Promise |
| `_get_new_curr` | - | ✅ | Inline in `_htraverse` |
| **Get Methods** | | | |
| `get` | `get` | ✅ | Single level |
| `get_item` | `getItem` | ✅ | Path traversal |
| `get_node` | `getNode` | ✅ | |
| `_get_node` | `_getNode` | ❌ | Inline in getNode |
| **Set Methods** | | | |
| `set_item` | `setItem` | ✅ | Minimo, senza attr/resolver |
| `set_attr` | `setAttr` | ⏳ | |
| `set_resolver` | `setResolver` | ⏳ | |
| `set_callback_item` | `setCallbackItem` | ⏳ | |
| **Delete Methods** | | | |
| `_pop` | `_pop` | ✅ | Internal, single level |
| `pop` | `pop` | ✅ | Path traversal |
| `del_item` | `delItem` | ✅ | Alias di pop |
| `pop_node` | `popNode` | ✅ | Ritorna BagNode |
| `clear` | `clear` | ✅ | |
| **Attribute Methods** | | | |
| `get_attr` | `getAttr` | ⏳ | |
| `del_attr` | `delAttr` | ⏳ | |
| `get_inherited_attributes` | `getInheritedAttributes` | ⏳ | |
| **Utility Methods** | | | |
| `node` | `node` | ⏳ | Quick access |
| `move` | `move` | ⏳ | |
| `as_dict` | `asDict` | ⏳ | |
| `setdefault` | `setdefault` | ⏳ | |
| `update` | `update` | ⏳ | |
| `deepcopy` | `deepcopy` | ⏳ | |
| `to_string` | `toTreeString` | ⏳ | ASCII tree |
| `keys` | `keys` | ✅ | |
| `values` | `values` | ✅ | |
| `items` | `items` | ✅ | |
| `for_each` | `forEach` | ✅ | Callback, static/deep options |
| `traverse` | `traverse` | ✅ | Static depth-first node iterator |
| `_node_flattener` | `_nodeFlattener` | ✅ | Per TyTx serialization |
| **Backref Methods** | | | |
| `set_backref` | `setBackref` | ✅ | Tree-leaf mode |
| `del_parent_ref` | `delParentRef` | ✅ | |
| `clear_backref` | `clearBackref` | ✅ | Ricorsivo |
| **Event Methods** | | | |
| `_on_node_changed` | `_onNodeChanged` | ✅ | Con propagazione |
| `_on_node_inserted` | `_onNodeInserted` | ✅ | Con propagazione |
| `_on_node_deleted` | `_onNodeDeleted` | ✅ | Con propagazione |
| `subscribe` | `subscribe` | ✅ | update/insert/delete/any |
| `unsubscribe` | `unsubscribe` | ✅ | |
| **Resolver Methods** | | | |
| `get_resolver` | `getResolver` | ⏳ | |

---

## Classi Aggiuntive (da portare)

| Classe Python | Classe JS | Status | Note |
|---------------|-----------|--------|------|
| `BagException` | `BagException` | ✅ | |
| `BagNodeException` | `BagNodeException` | ⏳ | |
| `BagResolver` | `BagResolver` | ⏳ | Base class |
| `BagCbResolver` | `BagCbResolver` | ⏳ | Callback resolver |
| `UrlResolver` | `UrlResolver` | ⏳ | fetch-based |

---

## Mixins (da portare come moduli separati)

| Mixin Python | Modulo JS | Status | Note |
|--------------|-----------|--------|------|
| `BagParser` | `bag_parse.js` | ⏳ | from_xml, from_json, from_tytx |
| `BagSerializer` | `bag_serialize.js` | ⏳ | to_xml, to_json, to_tytx |
| `BagQuery` | `bag_query.js` | ⏳ | query, digest, forEach, traverse, sum, sort |

---

## TyTx Serialization

| Metodo Python | Metodo JS | Status | Note |
|---------------|-----------|--------|------|
| `to_tytx` | `toTytx` | ✅ | transport='json'\|'msgpack', compact mode |
| `from_tytx` | `Bag.fromTytx` | ✅ | Static method |
| `_node_flattener` | `_nodeFlattener` | ✅ | Generator interno |

---

## Prossimi Step Suggeriti

1. ~~**pop/clear** - Completare operazioni CRUD base~~ ✅
2. ~~**getNode** - Accesso ai nodi~~ ✅
3. ~~**Backref** - Per eventi e subscription~~ ✅
4. ~~**Events** - subscribe/unsubscribe~~ ✅
5. ~~**Serializzazione TyTx** - toTytx/fromTytx~~ ✅
6. **Resolver** - Sistema lazy loading
7. **Query** - query, digest, sum, sort

---

**Ultimo aggiornamento**: 2026-01-20
