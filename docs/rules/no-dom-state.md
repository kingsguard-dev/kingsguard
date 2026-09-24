# no-dom-state

Keep UI state in React props and state. Recognized DOM refs use one built-in
operation allow list; all other direct DOM-member operations report.
This is a declarative UI rule, not a complete accessibility audit.

## Reported

```tsx
import { useRef } from 'react';

function Button() {
  const ref = useRef<HTMLButtonElement>(null);
  function deactivate() {
    if (ref.current) ref.current.tabIndex = -1;
  }
  return (
    <button ref={ref} onClick={deactivate}>
      Deactivate
    </button>
  );
}
```

## Preferred

```tsx
import { useState } from 'react';

function Button() {
  const [active, setActive] = useState(true);
  return (
    <button tabIndex={active ? 0 : -1} onClick={() => setActive(false)}>
      Deactivate
    </button>
  );
}
```

## Detection

The rule requires a variable initialized directly with an imported React `useRef`
or `createRef`, attached with `ref={variable}` to a native JSX element in the same
file. Named import aliases and default/namespace React imports are recognized.
Lexical scope resolution distinguishes shadowed variables and imports. Reassigned
ref variables are skipped.

A direct immutable node alias is also recognized within the function that declares
it, including blocks and null guards:

```tsx
const node = ref.current;
if (node) node.hidden = true; // reports hidden
```

The alias must be a `const` initialized directly from `ref.current`, with the ref
bound to a native JSX element as above. TypeScript assertions, non-null expressions,
optional access, and static string keys follow the same transparent syntax rules
as direct ref access. Reassigned alias bindings are skipped. This recognizes the
binding rather than a variable name; a shadowed `node` is separate.

The declaration must bind the ref object directly, such as
`const banana = useRef(null)`. A destructured value such as
`const { current: banana } = useRef(callback)` is not recognized as a ref object:
here `banana` is the stored callback, and its own properties are not DOM evidence.

## Built-in operations

Only these exact operation/member pairs are allowed:

| Operation             | Members                                                                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct method call    | `focus`, `blur`, `scroll`, `scrollTo`, `scrollBy`, `scrollIntoView`, `getBoundingClientRect`, `getClientRects`, `select`, `setSelectionRange`, `play`, `pause`               |
| Property read         | `clientWidth`, `clientHeight`, `clientTop`, `clientLeft`, `offsetWidth`, `offsetHeight`, `offsetTop`, `offsetLeft`, `scrollWidth`, `scrollHeight`, `scrollTop`, `scrollLeft` |
| Property write/update | `scrollTop`, `scrollLeft`                                                                                                                                                    |

This is project policy, not a claim that every excluded platform API is a bug.
The list does not validate element types, arguments, return values, or whether a
call will succeed. Media playback is imperative; unlisted media properties such
as `currentTime` and `volume` still report. Unknown names and dynamic member keys
report, even when a key could evaluate to an allowed name.

Call permission requires a direct call, including optional calls. Extracting a
method, replacing it, invoking it with `new`, or using `.call`, `.apply`, or
`.bind` reports. A readable property cannot be called. TypeScript assertions,
non-null expressions, chain wrappers, and string-literal keys are supported.

Writes include direct, compound and logical assignments, updates, destructuring
assignment targets, and `for...in`/`for...of` member targets. Deleting any member
reports, including writable scroll properties. UI-state reads also report:
`ref.current.value` is not a source of declarative state.

The first member directly on `ref.current` is checked once. Thus
`ref.current.style.color`, `ref.current.classList.add(...)`, and
`ref.current.dataset.key` report at `style`, `classList`, and `dataset`.
Results of allowed geometry calls can be used normally:
`ref.current.getBoundingClientRect().width` is allowed.

Direct object destructuring in declarations and assignments checks each top-level
property as a read. Nested patterns report once at their top-level key; dynamic
keys and each rest element report. Independent operations in defaults and
computed keys are checked too:

```js
const { clientWidth } = ref.current; // allowed
const {
  style: { color },
} = ref.current; // one report: style
const { focus, ...rest } = ref.current; // two reports
({ hidden: value } = ref.current); // one report: hidden
const { clientWidth = ref.current.value } = ref.current; // one report: value
```

Bare `ref.current` null guards, ref lifecycle assignments, and passing the node to
an SDK are outside DOM-member checking. An effect, helper, or SDK call does not
exempt a direct DOM-member operation from the allow list.

## Detection limits and overrides

- No cross-file tracking, ref-object aliases (`const alias = ref`), node alias
  chains, mutable or destructured node aliases, callback refs, forwarded refs,
  custom hooks, or DOM parameters. Node aliases declared at module scope or used
  inside nested functions are not followed. Direct `ref.current` access in nested
  functions remains covered. Refs attached only to custom components do not
  establish DOM ownership.
- Interprocedural SDK behavior and reflection through `Object`/`Reflect` APIs on
  bare nodes are not tracked.
- Dynamic access before node recognition (`ref[key]`), array destructuring or
  spread of bare nodes, `in` membership tests, and loop-binding object patterns
  are not tracked. These gaps are detection limits, not approved usage patterns.
- A ref with no matching JSX binding is skipped, even with a DOM type annotation.
  A native JSX binding supplies evidence, not proof of its runtime value.
- Recognition is syntax- and scope-based. Assignments to `ref.current` do not
  establish or disprove the runtime type of a later direct node alias.
- An explicit ESLint suppression with a reason is the site-level override:

```js
// eslint-disable-next-line @kingsguard/react/no-dom-state -- Required by this widget's integration contract.
ref.current.dataset.widgetMode = mode;
```

There are no automatic effects or third-party exemptions, no configurable allow
list, and no normal/strict modes. User extension mechanisms are deferred.
There is no automatic fix: moving imperative code into JSX/state can change
behavior and requires an intentional component change.

There are no options. The React preset enables this rule as an error. Projects
can downgrade it to `warn` or disable it with `off` in a later flat-config entry.
