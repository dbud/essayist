import { z } from "zod";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type JsonSchema =
  | boolean
  | {
      type?: string | string[];
      properties?: Record<string, JsonSchema>;
      required?: string[];
      description?: string;
      enum?: JsonValue[];
      const?: JsonValue;
      default?: JsonValue;
      items?: JsonSchema | JsonSchema[];
      additionalProperties?: JsonSchema | boolean;
      propertyNames?: JsonSchema | boolean;
      anyOf?: JsonSchema[];
      oneOf?: JsonSchema[];
      allOf?: JsonSchema[];
      $ref?: string;
      $defs?: Record<string, JsonSchema>;
    };

function resolveRef(
  schema: JsonSchema,
  defs?: Record<string, JsonSchema>,
): JsonSchema {
  if (typeof schema === "boolean") return schema;
  if (!schema.$ref) return schema;

  const name = schema.$ref.replace("#/$defs/", "");
  const target = defs?.[name];
  if (!target) return schema;

  return resolveRef(target, defs);
}

function resolve(
  schema: JsonSchema,
  defs?: Record<string, JsonSchema>,
): JsonSchema {
  schema = resolveRef(schema, defs);

  if (typeof schema === "boolean") return schema;

  if (schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      schema.properties[key] = resolve(prop, defs);
    }
  }

  return schema;
}

function isNullType(prop: JsonSchema): boolean {
  if (typeof prop === "boolean") return false;
  return (
    prop.type === "null" ||
    (Array.isArray(prop.type) && prop.type.includes("null"))
  );
}

function isNullable(prop: JsonSchema): boolean {
  if (typeof prop === "boolean") return false;
  if (isNullType(prop)) return true;

  const variants = prop.anyOf ?? prop.oneOf;
  if (variants) {
    return variants.some((s) => typeof s !== "boolean" && isNullType(s));
  }
  return false;
}

function describeType(prop: JsonSchema): string {
  if (typeof prop === "boolean") return prop ? "any" : "never";

  if (prop.type === "array") {
    if (Array.isArray(prop.items)) {
      const types = prop.items.map((i) => describeType(i));
      return `(${types.join(", ")}) tuple`;
    }
    const itemType = prop.items ? describeType(prop.items) : "any";
    return `${itemType} array`;
  }

  if (prop.type === "object") {
    if (isRecord(prop)) {
      const value =
        typeof prop.additionalProperties === "object" &&
        prop.additionalProperties !== null
          ? prop.additionalProperties
          : undefined;
      return `${value ? describeType(value) : "any"} record`;
    }
    return "object";
  }

  if (Array.isArray(prop.type)) {
    const nonNull = prop.type.filter((t) => t !== "null");
    if (nonNull.length === 0) return "null";
    return nonNull.join(" | ");
  }
  return prop.type ?? "any";
}

function getTypeName(prop: JsonSchema): string {
  if (typeof prop === "boolean") return prop ? "any" : "never";

  const variants = prop.anyOf ?? prop.oneOf;
  if (variants) {
    const nonNull = variants.filter(
      (s) => typeof s !== "boolean" && !isNullType(s),
    );
    if (nonNull.length === 1) {
      return describeType(nonNull[0]);
    }
    return nonNull.map((s) => describeType(s)).join(" | ");
  }

  if (prop.allOf) {
    return "intersection";
  }

  return describeType(prop);
}

interface FieldDoc {
  summary: string;
  nested: string[];
}

function describeField(
  name: string,
  prop: JsonSchema,
  required: ReadonlySet<string>,
  indent: string,
): FieldDoc {
  if (typeof prop === "boolean") {
    return { summary: `${name}: ${prop ? "any" : "never"}`, nested: [] };
  }

  const parts: string[] = [];
  if (prop.enum) {
    parts.push(`one of ${prop.enum.map((v) => formatValue(v)).join(", ")}`);
  } else if (prop.const !== undefined) {
    parts.push(`literal ${formatValue(prop.const)}`);
  }

  parts.push(getTypeName(prop));
  if (!required.has(name)) parts.push("optional");
  if (isNullable(prop)) parts.push("nullable");
  if (prop.default !== undefined) {
    parts.push(`default: ${formatValue(prop.default)}`);
  }

  // The description reads after the type, separated by a marker that cannot
  // appear in prose, so a sentence never runs into a type.
  const type = parts.join(", ");
  const described = prop.description ? `${type} -- ${prop.description}` : type;

  return {
    summary: `${name}: ${described}`,
    nested: nestedFieldsOf(prop, indent),
  };
}

function nestedFieldsOf(prop: JsonSchema, indent: string): string[] {
  const object = unwrapObject(prop);
  return object ? describeProperties(object, `${indent}  `) : [];
}

/** The object behind a property, through an array or a nullable union.
 * Undefined when there are no fixed fields to name. */
function unwrapObject(prop: JsonSchema): JsonSchema | undefined {
  if (typeof prop === "boolean") return undefined;
  const variants = prop.anyOf ?? prop.oneOf;
  if (variants) {
    const nonNull = variants.filter(
      (v) => typeof v !== "boolean" && !isNullType(v),
    );
    return nonNull.length === 1 ? unwrapObject(nonNull[0]) : undefined;
  }
  if (isRecord(prop)) return undefined;
  if (prop.type === "object") return prop;
  if (prop.type === "array" && prop.items && !Array.isArray(prop.items)) {
    return unwrapObject(prop.items);
  }
  return undefined;
}

/** True for an object with arbitrary keys, described by its value type. */
function isRecord(prop: JsonSchema): boolean {
  if (typeof prop === "boolean") return false;
  return (
    !!prop.propertyNames ||
    (typeof prop.additionalProperties === "object" &&
      prop.additionalProperties !== null)
  );
}

/** One `- field: type` line per property, recursing into nested objects. */
function describeProperties(schema: JsonSchema, indent = ""): string[] {
  if (typeof schema === "boolean" || !schema.properties) return [];
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties).flatMap(([key, prop]) => {
    const field = describeField(key, prop, required, indent);
    return [`${indent}- ${field.summary}`, ...field.nested];
  });
}

function formatValue(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function getExampleValue(prop: z.core.$ZodType): JsonValue | undefined {
  const meta = z.globalRegistry.get(prop);
  if (meta && typeof meta === "object" && "example" in meta) {
    return meta.example as JsonValue;
  }
  return undefined;
}

function buildExample(
  schema: z.ZodObject<z.ZodRawShape>,
): Record<string, JsonValue> {
  const example: Record<string, JsonValue> = {};
  const shape = schema.shape;
  for (const key of Object.keys(shape)) {
    const field = shape[key];
    const val = getExampleValue(field);
    if (val !== undefined) {
      example[key] = val;
    }
  }
  return example;
}

export function generateInstructions(
  schema: z.ZodObject<z.ZodRawShape>,
  options?: { includeExample?: boolean },
): string {
  const jsonSchema = z.toJSONSchema(schema, {
    target: "draft-07",
  }) as JsonSchema;
  const defs = typeof jsonSchema !== "boolean" ? jsonSchema.$defs : undefined;
  const resolved = resolve(jsonSchema, defs);

  if (typeof resolved === "boolean") {
    return "Respond with valid JSON.";
  }

  const lines = [
    "Return only one valid JSON object matching this shape. Do not use markdown fences, code blocks, comments, or any extra text:",
    "",
    ...describeProperties(resolved),
  ];

  if (options?.includeExample) {
    const example = buildExample(schema);
    if (Object.keys(example).length > 0) {
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
