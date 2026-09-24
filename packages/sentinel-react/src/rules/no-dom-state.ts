import {
  AST_NODE_TYPES as T,
  ESLintUtils,
  type TSESTree,
} from '@typescript-eslint/utils';
import {
  isReactDomNodeAlias,
  isReactRef,
  propertyName,
  resolve,
  unwrap,
} from '../adapters/react.js';

const callable = new Set([
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
]);
const readable = new Set([
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
]);
const writable = new Set(['scrollTop', 'scrollLeft']);

const createRule = ESLintUtils.RuleCreator(
  (name) =>
    `https://github.com/kingsguard-dev/kingsguard/blob/main/docs/rules/${name}.md`,
);

export const noDomState = createRule({
  name: 'no-dom-state',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Keep UI state in React props and state; allow only built-in DOM-ref operations.',
    },
    schema: [],
    messages: {
      preferDeclarative:
        'This operation on "{{property}}" through a React DOM ref is not in the built-in allow list. Express UI state through JSX props and React state instead.',
    },
  },
  defaultOptions: [],
  create(context) {
    const source = context.sourceCode;
    const domRefs = new Set<NonNullable<ReturnType<typeof resolve>>>();
    const writes = new Set<TSESTree.MemberExpression>();
    const members: TSESTree.MemberExpression[] = [];
    const extractions: {
      pattern: TSESTree.ObjectPattern;
      value: TSESTree.Node;
    }[] = [];
    function isDomNode(expression: TSESTree.Node): boolean {
      const current = unwrap(expression);
      if (current.type === T.Identifier)
        return isReactDomNodeAlias(source, current, domRefs);
      if (
        current.type !== T.MemberExpression ||
        propertyName(current) !== 'current'
      )
        return false;
      const id = unwrap(current.object);
      if (id.type !== T.Identifier) return false;
      const variable = resolve(source, id);
      return !!variable && domRefs.has(variable);
    }
    function report(node: TSESTree.Node, property: string | undefined): void {
      context.report({
        node,
        messageId: 'preferDeclarative',
        data: { property: property ?? '[unknown]' },
      });
    }
    function collectExtraction(
      pattern: TSESTree.Node,
      value: TSESTree.Node,
    ): void {
      const target = unwrap(pattern);
      if (target.type === T.ObjectPattern)
        extractions.push({ pattern: target, value });
    }
    function collectWrites(node: TSESTree.Node): void {
      const target = unwrap(node);
      switch (target.type) {
        case T.MemberExpression:
          writes.add(target);
          break;
        case T.ArrayPattern:
          for (const element of target.elements) {
            if (element) collectWrites(element);
          }
          break;
        case T.ObjectPattern:
          for (const property of target.properties) {
            collectWrites(
              property.type === T.RestElement
                ? property.argument
                : property.value,
            );
          }
          break;
        case T.AssignmentPattern:
          collectWrites(target.left);
          break;
        case T.RestElement:
          collectWrites(target.argument);
          break;
      }
    }
    return {
      JSXAttribute(node) {
        if (
          node.name.type !== T.JSXIdentifier ||
          node.name.name !== 'ref' ||
          node.value?.type !== T.JSXExpressionContainer
        )
          return;
        const tag = node.parent.name;
        // Only native JSX elements provide evidence of DOM ownership.
        if (tag.type !== T.JSXIdentifier || !/^[a-z]/.test(tag.name)) return;
        const id = unwrap(node.value.expression);
        if (id.type !== T.Identifier || !isReactRef(source, id)) return;
        const variable = resolve(source, id);
        if (variable) domRefs.add(variable);
      },
      MemberExpression(node) {
        members.push(node);
      },
      VariableDeclarator(node) {
        if (node.init) collectExtraction(node.id, node.init);
      },
      AssignmentExpression(node) {
        collectWrites(node.left);
        collectExtraction(node.left, node.right);
      },
      UpdateExpression(node) {
        collectWrites(node.argument);
      },
      ForInStatement(node) {
        collectWrites(node.left);
      },
      ForOfStatement(node) {
        collectWrites(node.left);
      },
      'Program:exit'() {
        for (const target of members) {
          if (!isDomNode(target.object)) continue;
          const property = propertyName(target);
          // Walk only transparent wrappers; trailing members are uses, not calls.
          let expression: TSESTree.Node = target;
          while (expression.parent && unwrap(expression.parent) === target) {
            expression = expression.parent;
          }
          const parent = expression.parent;
          const allowed =
            property !== undefined &&
            ((parent?.type === T.UnaryExpression &&
              parent.operator === 'delete') ||
            (parent?.type === T.TaggedTemplateExpression &&
              parent.tag === expression)
              ? false
              : writes.has(target)
                ? writable.has(property)
                : (parent?.type === T.CallExpression ||
                      parent?.type === T.NewExpression) &&
                    parent.callee === expression
                  ? parent.type === T.CallExpression && callable.has(property)
                  : readable.has(property));
          if (!allowed) report(target, property);
        }
        for (const { pattern, value } of extractions) {
          if (!isDomNode(value)) continue;
          for (const property of pattern.properties) {
            if (property.type === T.RestElement) {
              report(property, '[rest]');
              continue;
            }
            const name =
              !property.computed && property.key.type === T.Identifier
                ? property.key.name
                : property.key.type === T.Literal &&
                    typeof property.key.value === 'string'
                  ? property.key.value
                  : undefined;
            if (!name || !readable.has(name)) report(property, name);
          }
        }
      },
    };
  },
});
