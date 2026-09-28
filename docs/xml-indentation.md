# XML indentation

`toXml({pretty: true})` emits indentation during Bag traversal rather than
splitting and reformatting the complete serialized XML. The Python and JavaScript
modern writers use the same layout: two spaces per nesting level, a newline
between sibling elements, no leading indentation for top-level nodes, and no
trailing newline. Scalar text remains inline and is never stripped or indented
internally. An empty Bag emits an empty fragment.

`selfClosedTags`, attributes, resolver markers, and document headers retain their
serialization rules. Subtrees marked `xml:space="preserve"` stay compact,
conservatively including all descendants. Compact output is unchanged. This
change does not add the GenRoBag legacy envelope or legacy value type markers.
