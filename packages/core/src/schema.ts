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

function isNullable(prop: JsonSchema): boolean {
  if (typeof prop === "boolean") return false;

  const variants = prop.anyOf ?? prop.oneOf;
  if (variants) {
    return variants.some((s) => typeof s !== "boolean" && s.type === "null");
  }
  return false;
}

function getTypeName(prop: JsonSchema): string {
  if (typeof prop === "boolean") return prop ? "any" : "never";

  const variants = prop.anyOf ?? prop.oneOf;
  if (variants) {
    const nonNull = variants.filter(
      (s) => typeof s !== "boolean" && s.type !== "null",
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
    if (
      prop.propertyNames ||
      (typeof prop.additionalProperties === "object" &&
        prop.additionalProperties !== null)
    ) {
      const valueType = prop.additionalProperties
        ? describeType(prop.additionalProperties)
        : "any";
      return `${valueType} record`;
    }
    return "object";
  }

  if (Array.isArray(prop.type)) return prop.type.join(" | ");
  return prop.type ?? "any";
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

  const required = new Set(resolved.required ?? []);
  const lines = [
    "Return only one valid JSON object matching this shape. Do not use markdown fences, code blocks, comments, or any extra text:",
    "",
  ];

  if (resolved.properties) {
    for (const [key, prop] of Object.entries(resolved.properties)) {
      if (typeof prop === "boolean") {
        lines.push(`- ${key}: ${prop ? "any" : "never"}`);
        continue;
      }

      const parts: string[] = [];

      if (prop.description) parts.push(prop.description);

      if (prop.enum) {
        parts.push(`one of ${prop.enum.map((v) => formatValue(v)).join(", ")}`);
      } else if (prop.const !== undefined) {
        parts.push(`literal ${formatValue(prop.const)}`);
      }

      parts.push(getTypeName(prop));

      if (!required.has(key)) parts.push("optional");
      if (isNullable(prop)) parts.push("nullable");
      if (prop.default !== undefined) {
        parts.push(`default: ${formatValue(prop.default)}`);
      }

      lines.push(`- ${key}: ${parts.join(", ")}`);
    }
  }

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
