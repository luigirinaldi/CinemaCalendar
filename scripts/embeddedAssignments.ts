import ts from 'typescript';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);

function target(node: ts.Node): string | null {
    if (ts.isIdentifier(node)) return node.text;
    if (ts.isPropertyAccessExpression(node)) {
        const parent = target(node.expression);
        return parent && !forbidden.has(node.name.text)
            ? `${parent}.${node.name.text}`
            : null;
    }
    if (
        ts.isElementAccessExpression(node) &&
        node.argumentExpression &&
        ts.isStringLiteral(node.argumentExpression)
    ) {
        const parent = target(node.expression);
        const key = node.argumentExpression.text;
        return parent && /^[a-zA-Z_$][\w$]*$/.test(key) && !forbidden.has(key)
            ? `${parent}.${key}`
            : null;
    }
    return null;
}

/** Interpret a deliberately small literal subset; never evaluate page code. */
function literal(node: ts.Expression, depth = 0): Json {
    if (depth > 40) throw new Error('Assignment nesting limit exceeded');
    if (ts.isParenthesizedExpression(node))
        return literal(node.expression, depth + 1);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
        return node.text;
    if (ts.isNumericLiteral(node)) {
        const value = Number(node.text);
        if (Number.isFinite(value)) return value;
    }
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (
        ts.isPrefixUnaryExpression(node) &&
        node.operator === ts.SyntaxKind.MinusToken &&
        ts.isNumericLiteral(node.operand) &&
        Number.isFinite(Number(node.operand.text))
    )
        return -Number(node.operand.text);
    if (ts.isArrayLiteralExpression(node))
        return node.elements.map((entry) => literal(entry, depth + 1));
    if (ts.isObjectLiteralExpression(node)) {
        const result = Object.create(null) as Record<string, Json>;
        for (const property of node.properties) {
            if (
                !ts.isPropertyAssignment(property) ||
                !(
                    ts.isIdentifier(property.name) ||
                    ts.isStringLiteral(property.name) ||
                    ts.isNumericLiteral(property.name)
                )
            )
                throw new Error('Only literal object properties are supported');
            const key = property.name.text;
            if (forbidden.has(key)) throw new Error('Unsupported object key');
            result[key] = literal(property.initializer, depth + 1);
        }
        return result;
    }
    if (
        ts.isCallExpression(node) &&
        target(node.expression) === 'JSON.parse' &&
        node.arguments.length === 1 &&
        ts.isStringLiteral(node.arguments[0])
    )
        return JSON.parse(node.arguments[0].text) as Json;
    throw new Error('Assignment is not static data');
}

export function readScriptAssignments(script: string): Map<string, unknown> {
    const result = new Map<string, unknown>();
    if (script.length > 2_000_000) return result;
    const source = ts.createSourceFile(
        'programme.js',
        script,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS
    );
    if (
        (source as ts.SourceFile & { parseDiagnostics: readonly unknown[] })
            .parseDiagnostics.length
    )
        return result;
    const initializers = new Set<ts.Node>();
    const seen = new Set<string>();
    const blocked = new Set<string>();
    for (const statement of source.statements) {
        const entries: [string | null, ts.Expression | undefined][] =
            ts.isVariableStatement(statement)
                ? statement.declarationList.declarations.map((declaration) => [
                      ts.isIdentifier(declaration.name)
                          ? declaration.name.text
                          : null,
                      declaration.initializer,
                  ])
                : ts.isExpressionStatement(statement) &&
                    ts.isBinaryExpression(statement.expression) &&
                    statement.expression.operatorToken.kind ===
                        ts.SyntaxKind.EqualsToken
                  ? [
                        [
                            target(statement.expression.left),
                            statement.expression.right,
                        ],
                    ]
                  : [];
        for (const [name, expression] of entries) {
            if (!name || !expression || forbidden.has(name)) continue;
            // Duplicate writes are ambiguous even if the last one is literal.
            if (seen.has(name)) blocked.add(name);
            seen.add(name);
            if (blocked.has(name)) {
                result.delete(name);
                continue;
            }
            try {
                const value = literal(expression);
                if (value && typeof value === 'object') {
                    result.set(name, value);
                    initializers.add(expression);
                }
            } catch {
                /* Dynamic expressions remain unavailable. */
            }
        }
    }
    const canonical = (name: string) =>
        name.replace(/^(?:window|globalThis|self)\./, '');
    for (const candidate of result.keys()) {
        if (
            [...seen].some(
                (name) =>
                    name !== candidate &&
                    (canonical(name) === canonical(candidate) ||
                        canonical(name).startsWith(
                            canonical(candidate) + '.'
                        ) ||
                        canonical(candidate).startsWith(canonical(name) + '.'))
            )
        )
            result.delete(candidate);
    }
    const mutationTarget = (node: ts.Node): string | null =>
        target(node) ??
        (ts.isElementAccessExpression(node) ||
        ts.isPropertyAccessExpression(node)
            ? mutationTarget(node.expression)
            : null);
    const invalidate = (name: string | null) => {
        if (!name) return;
        for (const candidate of result.keys())
            if (
                canonical(name) === canonical(candidate) ||
                canonical(name).startsWith(canonical(candidate) + '.') ||
                canonical(candidate).startsWith(canonical(name) + '.')
            )
                result.delete(candidate);
    };
    const visit = (node: ts.Node) => {
        if (initializers.has(node)) return;
        if (
            ts.isBinaryExpression(node) &&
            node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
            node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
        ) {
            // The recognized top-level assignment itself is allowed.
            if (
                !(
                    ts.isExpressionStatement(node.parent) &&
                    node.parent.parent === source &&
                    initializers.has(node.right)
                )
            )
                invalidate(mutationTarget(node.left));
        }
        if (
            ts.isPrefixUnaryExpression(node) ||
            ts.isPostfixUnaryExpression(node)
        )
            invalidate(mutationTarget(node.operand));
        if (ts.isDeleteExpression(node))
            invalidate(mutationTarget(node.expression));
        if (ts.isCallExpression(node)) {
            invalidate(mutationTarget(node.expression));
            for (const argument of node.arguments) {
                const references = (child: ts.Node) => {
                    invalidate(mutationTarget(child));
                    ts.forEachChild(child, references);
                };
                references(argument);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return result;
}
