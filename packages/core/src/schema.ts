import { z } from "zod";

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  description?: string;
  enum?: string[];
  const?: string;
  default?: string;
  items?: JsonSchema | JsonSchema[];
  additionalProperties?: JsonSchema | boolean;
  propertyNames?: JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
};

function resolve(schema: JsonSchema): JsonSchema {
  if (!schema.$ref) return schema;
  const name = schema.$ref.replace("#/$defs/", "");
  return schema.$defs?.[name] ?? schema;
}

function isNullable(prop: JsonSchema): boolean {
  const variants = prop.anyOf ?? prop.oneOf;
  if (variants) {
    return variants.some((s) => s.type === "null");
  }
  return false;
}

function getTypeName(prop: JsonSchema): string {
  const variants = prop.anyOf ?? prop.oneOf;
  if (variants) {
    const nonNull = variants.filter((s) => s.type !== "null");
    if (nonNull.length === 1) {
      return describeType(nonNull[0]);
    }
    return nonNull.map((s) => describeType(s)).join(" | ");
  }

  if (prop.allOf) {
    return "object";
  }

  return describeType(prop);
}

function describeType(prop: JsonSchema): string {
  if (prop.type === "array") {
    if (Array.isArray(prop.items)) {
      const types = prop.items.map((i) => i.type ?? "any");
      return `(${types.join(", ")}) tuple`;
    }
    const itemType = prop.items?.type ?? "any";
    return `${itemType} array`;
  }

  if (prop.type === "object") {
    if (
      prop.propertyNames ||
      (typeof prop.additionalProperties === "object" &&
        prop.additionalProperties !== null)
    ) {
      const valueType = (prop.additionalProperties as JsonSchema)?.type ??
        "any";
      return `${valueType} record`;
    }
    return "object";
  }

  return prop.type ?? "any";
}

export function generateInstructions(
  schema: z.ZodObject<z.ZodRawShape>,
): string {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-07" });
  const resolved = resolve(jsonSchema as JsonSchema);

  const required = new Set(resolved.required ?? []);
  const lines = ["Return JSON matching this shape:", ""];

  if (resolved.properties) {
    for (const [key, prop] of Object.entries(resolved.properties)) {
      const parts: string[] = [];

      if (prop.description) parts.push(prop.description);

      if (prop.enum) {
        parts.push(
          `one of ${
            prop.enum.map((v: string) => JSON.stringify(v)).join(", ")
          }`,
        );
      } else if (prop.const !== undefined) {
        parts.push(`literal ${JSON.stringify(prop.const)}`);
      }

      parts.push(getTypeName(prop));

      const optional = !required.has(key) || isNullable(prop) ||
        prop.default !== undefined;
      parts.push(optional ? "optional" : "required");

      if (prop.default !== undefined) {
        parts.push(`default: ${JSON.stringify(prop.default)}`);
      }

      lines.push(`- ${key}: ${parts.join(", ")}`);
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
