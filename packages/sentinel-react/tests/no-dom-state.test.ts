import { afterAll, describe, it } from 'vitest';
import { RuleTester } from '@typescript-eslint/rule-tester';
import * as parser from '@typescript-eslint/parser';
import { noDomState } from '../src/rules/no-dom-state.js';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } },
});
const example = (
  write: string,
  imports = "import { useRef } from 'react';",
  factory = 'useRef(null)',
  tag = 'button',
) => `${imports}
function Example() {
  const ref = ${factory};
  const update = () => { ${write} };
  return <${tag} ref={ref} onClick={update} />;
}`;
tester.run('no-dom-state', noDomState, {
  valid: [
    example('ref.current.focus();'),
    example('ref.current = null;'),
    example('ref.current.scrollTop = 0;'),
    example('[ref.current.scrollTop] = values;'),
    example('function update(ref) { [ref.current.value] = data; }'),
    example('[ref.current.value] = data;', '', '({ current: {} })'),
    `import { useRef } from 'react'; function Example() {
      const callback = Object.assign(node => {}, { current: { value: 0 } });
      const { current: banana } = useRef(callback);
      banana.current.value = 1;
      [banana.current.value] = data;
      return <input ref={banana}/>;
    }`,
    example('ref.current.tabIndex = -1;', '', '({ current: {} })'),
    example('ref.current.tabIndex = -1;', "import { useRef } from 'other';"),
    example(
      'ref.current.tabIndex = -1;',
      "import { useRef } from 'react';",
      'useRef(null)',
      'Widget',
    ),
    "import { useRef } from 'react'; const ref = useRef({tabIndex: 0}); ref.current.tabIndex = -1;",
    example('function update(ref) { ref.current.tabIndex = -1; }'),
    "import { useRef } from 'react'; function Example(useRef) { const ref = useRef(null); ref.current.tabIndex = -1; return <button ref={ref}/>; }",
    "import React from 'react'; function Example(React) { const ref = React.useRef(null); ref.current.tabIndex = -1; return <button ref={ref}/>; }",
    "import { useRef } from 'react'; let ref = useRef(null); ref = other; ref.current.tabIndex = -1; const element = <button ref={ref}/>;",
    "import { useRef } from 'react'; function Example() { const ref = useRef(null); return <button ref={ref} tabIndex={-1}/>; }",
  ],
  invalid: [
    ...[
      'const index = ref.current.tabIndex; void index;',
      '({ [ref.current.value]: value } = data);',
      '[value = ref.current.value] = data;',
    ].map((body) => ({
      code: example(body),
      errors: [{ messageId: 'preferDeclarative' as const }],
      output: null,
    })),
    {
      code: example('[ref.current.value, ref.current.checked] = values;'),
      errors: [
        { messageId: 'preferDeclarative', data: { property: 'value' } },
        { messageId: 'preferDeclarative', data: { property: 'checked' } },
      ],
      output: null,
    },
    ...[
      'tabIndex',
      'className',
      'hidden',
      'disabled',
      'checked',
      'value',
      'textContent',
      'innerHTML',
    ].map((property) => ({
      code: example(`ref.current.${property} = value;`),
      errors: [{ messageId: 'preferDeclarative' as const, data: { property } }],
      output: null,
    })),
    ...[
      example('ref.current.tabIndex = -1;'),
      example("ref['current']['tabIndex'] = -1;"),
      example('ref.current.tabIndex += 1;'),
      example('ref.current.tabIndex++;'),
      example('[ref.current.tabIndex] = values;'),
      example('({ value: ref.current.tabIndex } = data);'),
      example('({ nested: [, { value: ref.current.tabIndex = 0 }] } = data);'),
      example('[...ref.current.tabIndex] = values;'),
      example('({ ...ref.current.tabIndex } = data);'),
      example('[ref.current!.tabIndex] = values;'),
      example('ref.current!.tabIndex = -1;'),
      example('(ref.current as HTMLButtonElement).tabIndex = -1;'),
      example(
        'ref.current.tabIndex = -1;',
        "import { useRef as makeRef } from 'react';",
        'makeRef(null)',
      ),
      example(
        'ref.current.tabIndex = -1;',
        "import * as React from 'react';",
        'React.useRef(null)',
      ),
      example(
        'ref.current.tabIndex = -1;',
        "import React from 'react';",
        'React.createRef()',
      ),
      example(
        'ref.current.tabIndex = -1;',
        "import { createRef } from 'react';",
        'createRef()',
      ),
      "import { useRef } from 'react'; function Example() { const ref = useRef(null); const view = <button ref={ref}/>; ref.current.tabIndex = -1; return view; }",
    ].map((code) => ({
      code,
      filename: 'example.tsx',
      errors: [
        {
          messageId: 'preferDeclarative' as const,
          data: { property: 'tabIndex' },
        },
      ],
      output: null,
    })),
  ],
});

const methods = [
  'focus',
  'blur',
  'scroll',
  'scrollTo',
  'scrollBy',
  'scrollIntoView',
  'getBoundingClientRect',
  'getClientRects',
  'select',
  'setSelectionRange',
  'play',
  'pause',
];
const reads = [
  'clientWidth',
  'clientHeight',
  'clientTop',
  'clientLeft',
  'offsetWidth',
  'offsetHeight',
  'offsetTop',
  'offsetLeft',
  'scrollWidth',
  'scrollHeight',
  'scrollTop',
  'scrollLeft',
];
const writes = ['scrollTop', 'scrollLeft'];
const writeForms = (name: string) => [
  `ref.current.${name} = value;`,
  `ref.current.${name} += 1;`,
  `ref.current.${name} ||= 1;`,
  `ref.current.${name} &&= 1;`,
  `ref.current.${name} ??= 1;`,
  `ref.current.${name}++;`,
  `--ref.current.${name};`,
  `[ref.current.${name} = 0] = data;`,
  `({...ref.current.${name}} = data);`,
  `({x: ref.current.${name}} = data);`,
  `for(ref.current.${name} of values){}`,
  `for(ref.current.${name} in values){}`,
];
const denied = (body: string, count = 1) => ({
  code: example(body),
  filename: 'example.tsx',
  errors: Array.from({ length: count }, () => ({
    messageId: 'preferDeclarative' as const,
  })),
  output: null,
});
tester.run('built-in DOM-ref operation allowlist', noDomState, {
  valid: [
    ...methods.flatMap((name) =>
      [
        `ref.current.${name}();`,
        `ref.current?.${name}?.(...args);`,
        `(ref.current!['${name}'] as Function)();`,
        `((ref.current.${name} as Function)!)();`,
      ].map((body) => ({ code: example(body), filename: 'example.tsx' })),
    ),
    ...reads.flatMap((name) =>
      [
        `const value = ref.current.${name};`,
        `const {'${name}': value} = ref.current;`,
        `({${name}: value = 0} = ref.current);`,
      ].map((body) => example(body)),
    ),
    ...writes.flatMap((name) => writeForms(name).map((body) => example(body))),
    example('if(ref.current) sdk.mount(ref.current);'),
    example('const width = ref.current.getBoundingClientRect().width;'),
    example('const {clientWidth = ref.current.clientHeight} = ref.current;'),
    // Named detection limits, not approved escape hatches.
    {
      name: 'ref alias is not tracked',
      code: example('const alias=ref; alias.current.hidden=true;'),
    },
    {
      name: 'reflection on bare node is not tracked',
      code: example(
        "Reflect.set(ref.current, 'hidden', true); Object.assign(ref.current, value);",
      ),
    },
    {
      name: 'dynamic current receiver is not tracked',
      code: example('ref[key].hidden=true;'),
    },
    {
      name: 'bare-node spread, array patterns and membership are not tracked',
      code: example(
        "const copy={...ref.current}; const [item]=ref.current; const yes='hidden' in ref.current;",
      ),
    },
    {
      name: 'loop binding object patterns are not tracked',
      code: example('for(const {hidden} of [ref.current]) {}'),
    },
  ],
  invalid: [
    ...methods.flatMap((name) =>
      [
        `const value=ref.current.${name};`,
        `const {${name}}=ref.current;`,
        `ref.current.${name}.call(ref.current);`,
        `ref.current.${name}.apply(ref.current, args);`,
        `ref.current.${name}.bind(ref.current);`,
        `new ref.current.${name}();`,
        `ref.current.${name}\`text\`;`,
        `delete ref.current.${name};`,
        ...writeForms(name),
      ].map((body) => denied(body)),
    ),
    ...reads.flatMap((name) =>
      [
        `ref.current.${name}();`,
        `new ref.current.${name}();`,
        `ref.current.${name}\`text\`;`,
        `delete ref.current.${name};`,
        ...(writes.includes(name) ? [] : writeForms(name)),
      ].map((body) => denied(body)),
    ),
    ...[
      'tabIndex',
      'className',
      'hidden',
      'disabled',
      'checked',
      'value',
      'textContent',
      'innerHTML',
      'style',
      'classList',
      'dataset',
      'currentTime',
      'volume',
      'unknown',
    ].flatMap((name) =>
      [
        `const value=ref.current.${name};`,
        `ref.current.${name}=value;`,
        `ref.current.${name}();`,
        `const {${name}}=ref.current;`,
      ].map((body) => denied(body)),
    ),
    ...[
      'ref.current[key]();',
      'ref.current[`focus`]();',
      'ref.current[key]=value;',
      'ref.current.style.color=value;',
      'ref.current.classList.add(token);',
      'ref.current.dataset.key=value;',
      'delete ref.current?.scrollTop;',
      'const {[key]: value}=ref.current;',
      'const {style:{color}}=ref.current;',
      'const {clientWidth,...rest}=ref.current;',
      '({hidden:value}=ref.current);',
      'useEffect(()=>{ref.current.hidden=true;});',
      'sdk.mount(ref.current.style);',
      '(ref.current.style as CSSStyleDeclaration).color=value;',
      '((ref.current.clientWidth as number)!)++;',
    ].map((body) => denied(body)),
    denied('const {style, focus, hidden, ...rest}=ref.current;', 4),
    denied('const {hidden=ref.current.value}=ref.current;', 2),
    denied('const {[ref.current.hidden]:value}=ref.current;', 2),
    denied('({hidden:ref.current.value}=ref.current);', 2),
    denied('const {clientWidth=ref.current.hidden}=ref.current;'),
  ],
});

const alias = (body: string) => example(`const node = ref.current; ${body}`);
tester.run('direct const DOM-node aliases', noDomState, {
  valid: [
    alias('node.focus(); node?.scrollIntoView();'),
    alias('const width = node.clientWidth; node.scrollTop += 1;'),
    alias('const { clientHeight } = node; node.scrollLeft = 0;'),
    alias('const box = node.getBoundingClientRect().width;'),
    example(
      'const node = (ref.current as HTMLButtonElement)!; node?.focus?.();',
    ),
    example('const node = ref.current; if (node) node.scrollTo(0, 1);'),
    // These bindings do not establish a direct, immutable DOM-node alias.
    example(
      'const alias = ref; const node = alias.current; node.hidden = true;',
    ),
    example(
      'const first = ref.current; const node = first; node.hidden = true;',
    ),
    example('let node = ref.current; node.hidden = true;'),
    example('var node = ref.current; node.hidden = true;'),
    example('const { current: node } = ref; node.hidden = true;'),
    example('const node = ref.current; node = other; node.hidden = true;'),
    example(
      'const node = ref.current; function nested() { node.hidden = true; }',
    ),
    example('const node = ref.current; (() => node.hidden = true)();'),
    example(
      'const node = ref.current; function nested(node) { node.hidden = true; }',
    ),
    example(
      'function nested(ref) { const node = ref.current; node.hidden = true; }',
    ),
    example(
      'const node = ref.current; node.hidden = true;',
      '',
      '({ current: {} })',
    ),
    example(
      'const node = ref.current; node.hidden = true;',
      "import { useRef } from 'other';",
    ),
    "import { createRef } from 'react'; const ref = createRef(); const node = ref.current; node.hidden = true; const view = <button ref={ref}/>;",
    example(
      'const node = ref.current; node.hidden = true;',
      "import { useRef } from 'react';",
      'useRef(null)',
      'Widget',
    ),
  ],
  invalid: [
    ...[
      'node.hidden;',
      'node.value = value;',
      'node.style.color = value;',
      'node.setAttribute("hidden", "");',
      'node[key] = value;',
      'const method = node.focus;',
      'const { focus } = node;',
      'const { style } = node;',
      '({ hidden: value } = node);',
      'delete node.scrollTop;',
      '(node as HTMLButtonElement).hidden = true;',
      'node?.hidden;',
      'node?.setAttribute?.("hidden", "");',
    ].map((body) => denied(`const node = ref.current; ${body}`)),
    denied('const node = ref.current; if (node) node.hidden = true;'),
    denied('const node = ref["current"]; node.hidden = true;'),
    denied(
      'ref.current = other; const node = ref.current; node.hidden = true;',
    ),
    denied(
      'const node = ref.current; ref.current.hidden = true; function nested() { ref.current.hidden = true; }',
      2,
    ),
  ],
});
