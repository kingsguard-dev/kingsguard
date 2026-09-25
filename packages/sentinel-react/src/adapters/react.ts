import {
  AST_NODE_TYPES as T,
  ASTUtils,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';

export function unwrap(node: TSESTree.Node): TSESTree.Node {
  while (
    node.type === T.TSNonNullExpression ||
    node.type === T.TSAsExpression ||
    node.type === T.TSTypeAssertion ||
    node.type === T.ChainExpression ||
    node.type === T.TSSatisfiesExpression
  ) {
    node = node.expression;
  }
  return node;
}

export function propertyName(
  node: TSESTree.MemberExpression,
): string | undefined {
  if (!node.computed && node.property.type === T.Identifier)
    return node.property.name;
  if (
    node.computed &&
    node.property.type === T.Literal &&
    typeof node.property.value === 'string'
  )
    return node.property.value;
  return undefined;
}

export function resolve(
  source: TSESLint.SourceCode,
  node: TSESTree.Identifier,
): TSESLint.Scope.Variable | null {
  return ASTUtils.findVariable(source.getScope(node), node.name);
}

/** Resolve imports by binding, so aliases work and shadowed names do not match. */
function isReactFactory(
  source: TSESLint.SourceCode,
  expression: TSESTree.Node,
): boolean {
  const node = unwrap(expression);
  const id =
    node.type === T.Identifier
      ? node
      : node.type === T.MemberExpression
        ? unwrap(node.object)
        : undefined;
  if (id?.type !== T.Identifier) return false;
  const variable = resolve(source, id);
  return (
    variable?.defs.some((def) => {
      if (
        def.type !== 'ImportBinding' ||
        def.parent.type !== T.ImportDeclaration ||
        def.parent.source.value !== 'react' ||
        def.parent.importKind === 'type'
      )
        return false;
      const spec = def.node;
      if (
        node.type === T.Identifier &&
        spec.type === T.ImportSpecifier &&
        spec.importKind !== 'type'
      ) {
        const name =
          spec.imported.type === T.Identifier
            ? spec.imported.name
            : spec.imported.value;
        return name === 'useRef' || name === 'createRef';
      }
      return (
        node.type === T.MemberExpression &&
        (spec.type === T.ImportDefaultSpecifier ||
          spec.type === T.ImportNamespaceSpecifier) &&
        ['useRef', 'createRef'].includes(propertyName(node) ?? '')
      );
    }) ?? false
  );
}

export function isReactRef(
  source: TSESLint.SourceCode,
  id: TSESTree.Identifier,
): boolean {
  const variable = resolve(source, id);
  if (
    !variable ||
    variable.references.some((ref) => ref.isWrite() && !ref.init)
  )
    return false;
  return variable.defs.some((def) => {
    if (
      def.type !== 'Variable' ||
      def.node.id.type !== T.Identifier ||
      !def.node.init
    )
      return false;
    const init = unwrap(def.node.init);
    return (
      init.type === T.CallExpression && isReactFactory(source, init.callee)
    );
  });
}

function containingFunction(node: TSESTree.Node): TSESTree.Node | null {
  let parent: TSESTree.Node | undefined = node.parent;
  while (parent) {
    if (
      parent.type === T.FunctionDeclaration ||
      parent.type === T.FunctionExpression ||
      parent.type === T.ArrowFunctionExpression
    )
      return parent;
    parent = parent.parent;
  }
  return null;
}

/** Recognize only an immutable, same-function node alias of a proven JSX DOM ref. */
export function isReactDomNodeAlias(
  source: TSESLint.SourceCode,
  id: TSESTree.Identifier,
  domRefs: ReadonlySet<TSESLint.Scope.Variable>,
): boolean {
  const variable = resolve(source, id);
  if (
    !variable ||
    variable.references.some((ref) => ref.isWrite() && !ref.init)
  )
    return false;
  return variable.defs.some((def) => {
    const declarationFunction = containingFunction(def.node);
    if (
      def.type !== 'Variable' ||
      def.parent.kind !== 'const' ||
      def.node.id.type !== T.Identifier ||
      !def.node.init ||
      !declarationFunction ||
      declarationFunction !== containingFunction(id)
    )
      return false;
    const init = unwrap(def.node.init);
    if (init.type !== T.MemberExpression || propertyName(init) !== 'current')
      return false;
    const ref = unwrap(init.object);
    if (ref.type !== T.Identifier) return false;
    const binding = resolve(source, ref);
    return !!binding && domRefs.has(binding);
  });
}
