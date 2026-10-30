/**
 * The structured-output instructions the models read: a schema's shape rendered as pseudocode, plus
 * an optional example, and fence stripping for replies. The walker reads the schema's AST directly,
 * so the prompt text changes only when a schema's shape changes.
 */

import { Schema, SchemaAST } from "effect";

type Ast = SchemaAST.AST;
type Annotations = Schema.Annotations.Documentation<Schema.Json>;

function annotationsOf(ast: Ast): Annotations {
  // Resolved the way Effect does: a checked schema (Int, bounded numbers) keeps its annotations on
  // the last check; unchecked ones keep them on the node.
  const resolved =
    ast.checks !== undefined && ast.checks.length > 0
      ? ast.checks[ast.checks.length - 1].annotations
      : ast.annotations;
  return resolved ?? {};
}

/** A check marking whole numbers, the way `Schema.Int` carries one. The id
 * is the check's stable identity marker, matched the same way Effect's own encoders and JSON
 * projection match it. */
function isInt(ast: Ast): boolean {
  return hasIntCheck(ast.checks ?? []);
}

function hasIntCheck(checks: readonly SchemaAST.Check<unknown>[]): boolean {
  return checks.some(
    (check) =>
      check.annotations?.representation?.id === "effect/schema/isInt" ||
      (check._tag === "FilterGroup" && hasIntCheck(check.checks)),
  );
}

function describeType(ast: Ast): string {
  switch (ast._tag) {
    case "String":
      return "string";
    case "Number":
      return isInt(ast) ? "integer" : "number";
    case "Boolean":
      return "boolean";
    case "BigInt":
      return "bigint";
    case "Null":
      return "null";
    case "Never":
      return "never";
    case "ObjectKeyword":
      return "object";
    case "Arrays":
      if (ast.elements.length > 0) {
        return `(${ast.elements.map(describeType).join(", ")}) tuple`;
      }
      if (ast.rest.length === 1) return `${describeType(ast.rest[0])} array`;
      // A rest with several types reads as a union of them.
      return `(${ast.rest.map(describeType).join(" | ")}) array`;
    case "Objects":
      if (ast.indexSignatures.length > 0) {
        return `${describeType(ast.indexSignatures[0].type)} record`;
      }
      return "object";
    case "Union": {
      const nonNull = ast.types.filter((t) => !SchemaAST.isNull(t));
      if (nonNull.length === 1) return describeType(nonNull[0]);
      return [...new Set(nonNull.map(describeType))].join(" | ");
    }
    case "Literal":
      return typeof ast.literal;
    default:
      return "any";
  }
}

function isNullable(ast: Ast): boolean {
  return SchemaAST.isNull(ast) || (SchemaAST.isUnion(ast) && ast.types.some(SchemaAST.isNull));
}

/** The literal prefix and scalar type of a field whose whole type is
 * literals: `Schema.Literal`, alone or unioned (as `Schema.Literals` builds it). `Null` members may
 * join; nullability reports separately. */
function literalParts(ast: Ast): string[] | undefined {
  if (SchemaAST.isLiteral(ast)) {
    return [`literal ${formatValue(ast.literal)}`, typeof ast.literal];
  }
  if (!SchemaAST.isUnion(ast)) return undefined;
  const members = ast.types;
  if (members.some((t) => !SchemaAST.isLiteral(t) && !SchemaAST.isNull(t))) {
    return undefined;
  }
  const literals = members.filter(SchemaAST.isLiteral);
  if (literals.length === 0) return undefined;
  const values = literals.map((t) => t.literal);
  const scalars = [...new Set(values.map((v) => typeof v))].join(" | ");
  if (values.length === 1) {
    return [`literal ${formatValue(values[0])}`, scalars];
  }
  return [`one of ${values.map((v) => formatValue(v)).join(", ")}`, scalars];
}

/** The fields behind a type: the object itself, through an array or a
 * nullable union. Undefined when there are no fixed fields to name. */
function unwrapObject(ast: Ast): SchemaAST.Objects | undefined {
  switch (ast._tag) {
    case "Objects":
      return ast.indexSignatures.length === 0 ? ast : undefined;
    case "Arrays":
      return ast.elements.length === 0 && ast.rest.length === 1
        ? unwrapObject(ast.rest[0])
        : undefined;
    case "Union": {
      const nonNull = ast.types.filter((t) => !SchemaAST.isNull(t));
      return nonNull.length === 1 ? unwrapObject(nonNull[0]) : undefined;
    }
    default:
      return undefined;
  }
}

function nestedFieldsOf(ast: Ast, indent: string): string[] {
  const object = unwrapObject(ast);
  return object ? describeProperties(object, `${indent}  `) : [];
}

function describeField(sig: SchemaAST.PropertySignature, ast: Ast, indent: string): string[] {
  const annotations = annotationsOf(ast);
  const parts = literalParts(ast) ?? [describeType(ast)];
  if (ast.context?.isOptional === true) parts.push("optional");
  if (isNullable(ast)) parts.push("nullable");
  if (annotations.default !== undefined) {
    parts.push(`default: ${formatValue(annotations.default)}`);
  }

  // The description reads after the type, separated by a marker that cannot appear in prose, so a
  // sentence never runs into a type.
  const type = parts.join(", ");
  const described = annotations.description ? `${type} -- ${annotations.description}` : type;
  return [`${indent}- ${sig.name as string}: ${described}`, ...nestedFieldsOf(ast, indent)];
}

/** One `- field: type` line per property, recursing into nested objects. */
function describeProperties(object: SchemaAST.Objects, indent = ""): string[] {
  return object.propertySignatures.flatMap((sig) => describeField(sig, sig.type, indent));
}

function formatValue(value: Schema.Json | SchemaAST.LiteralValue): string {
  if (typeof value === "bigint" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

/** The whole-value example, or one built from annotated fields. */
function buildExample(object: SchemaAST.Objects): Schema.JsonObject | undefined {
  const root = annotationsOf(object).examples?.[0];
  if (Schema.is(Schema.JsonObject)(root)) return root;
  const example: Record<string, Schema.Json> = {};
  for (const sig of object.propertySignatures) {
    const value = annotationsOf(sig.type).examples?.[0];
    if (value !== undefined) {
      example[sig.name as string] = value;
    }
  }
  return Object.keys(example).length > 0 ? example : undefined;
}

export function generateInstructions(
  schema: Schema.Constraint,
  options?: { includeExample?: boolean },
): string {
  const ast = schema.ast;
  if (ast._tag !== "Objects") {
    return "Respond with valid JSON.";
  }

  const lines = [
    "Return only one valid JSON object matching this shape. Do not use markdown fences, code blocks, comments, or any extra text:",
    "",
    ...describeProperties(ast),
  ];

  if (options?.includeExample) {
    const example = buildExample(ast);
    if (example) {
      lines.push("", "Example:", JSON.stringify(example, null, 2));
    }
  }

  return lines.join("\n");
}

export function stripMarkdownFences(text: string): string {
  return text
    .replace(/^\s*```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
}
