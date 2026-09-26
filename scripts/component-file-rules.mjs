import ts from 'typescript';

function unwrap(node) {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node)
  )
    node = node.expression;
  return node;
}

function implementation(expression, ast) {
  const node = unwrap(expression);
  return (
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    (ts.isCallExpression(node) && /(?:^|\.)(?:memo|forwardRef)$/.test(node.expression.getText(ast)))
  );
}

export function componentNames(source, file = 'component.tsx') {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const names = [];
  function inspect(node) {
    if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
      ((node.name && /^[A-Z]/.test(node.name.text)) ||
        node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword))
    )
      names.push(node.name?.text ?? '<anonymous default>');
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      /^[A-Z]/.test(node.name.text) &&
      node.initializer &&
      implementation(node.initializer, ast)
    )
      names.push(node.name.text);
    if (ts.isExportAssignment(node) && implementation(node.expression, ast))
      names.push('<anonymous default>');
    ts.forEachChild(node, inspect);
  }
  inspect(ast);
  return names;
}
