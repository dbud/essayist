/* @ts-types="npm:@types/babel__core@^7.20.5" */ import type {
  PluginObj,
  types,
} from "npm:@babel/core@^7.28.0";

export function removePolyfills({
  types: t,
}: {
  types: typeof types;
}): PluginObj {
  return {
    name: "fresh-remove-polyfills",
    visitor: {
      IfStatement(path) {
        if (
          t.isUnaryExpression(path.node.test) &&
          path.node.test.operator === "!" &&
          t.isMemberExpression(path.node.test.argument) &&
          t.isIdentifier(path.node.test.argument.object) &&
          ((path.node.test.argument.object.name === "String" &&
            t.isIdentifier(path.node.test.argument.property) &&
            path.node.test.argument.property.name === "fromCodePoint") ||
            (path.node.test.argument.object.name === "Object" &&
              t.isIdentifier(path.node.test.argument.property) &&
              (path.node.test.argument.property.name === "keys" ||
                path.node.test.argument.property.name === "create")))
        ) {
          if (path.node.alternate) {
            path.replaceWith(t.cloneNode(path.node.alternate, true));
          } else {
            path.remove();
          }
        }
      },
    },
  };
}
