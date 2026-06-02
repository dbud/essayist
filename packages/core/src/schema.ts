import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  description?: string;
  enum?: string[];
  const?: string;
  default?: string;
  items?: JsonSchema;
  additionalProperties?: JsonSchema | boolean;
  $ref?: string;
  definitions?: Record<string, JsonSchema>;
  anyOf?: JsonSchema[];
};

function resolve(schema: JsonSchema): JsonSchema {
  if (schema.$ref && schema.definitions) {
    const name = schema.$ref.replace("#/definitions/", "");
    return schema.definitions[name] ?? schema;
  }
  return schema;
}

function isNullable(prop: JsonSchema): boolean {
  if (prop.anyOf) {
    return prop.anyOf.some((s) => s.type === "null");
  }
  if (Array.isArray(prop.type)) {
    return prop.type.includes("null");
  }
  if (typeof prop.type === "string") {
    return prop.type.includes("null");
  }
  return false;
}

function getTypeName(prop: JsonSchema): string {
  // anyOf (e.g. nullable array, nullable object)
  if (prop.anyOf) {
    const nonNull = prop.anyOf.find((s) => s.type !== "null");
    if (!nonNull) return "any";
    if (nonNull.type === "array") {
      const itemType = nonNull.items?.type ?? "any";
      return `${itemType} array`;
    }
    if (nonNull.type === "object") {
      return nonNull.additionalProperties ? "object (record)" : "object";
    }
    if (Array.isArray(nonNull.type)) {
      return nonNull.type.filter((t) => t !== "null").join(" | ");
    }
    return nonNull.type ?? "any";
  }

  const type = prop.type;

  // Array type: string[]
  if (type === "array") return `${prop.items?.type ?? "any"} array`;

  // Object type: check if it's a record (has additionalProperties)
  if (type === "object") {
    if (
      prop.additionalProperties && typeof prop.additionalProperties === "object"
    ) {
      const valueType = prop.additionalProperties.type ?? "any";
      return `${valueType} record`;
    }
    return "object";
  }

  // Array of types: ["string", "number"] or ["string", "null"]
  if (Array.isArray(type)) {
    const types = type.filter((t) => t !== "null");
    if (types.length === 1 && types[0] === "array") {
      return `${prop.items?.type ?? "any"} array`;
    }
    return types.join(" | ");
  }

  // Comma-separated types: "string,null"
  if (typeof type === "string") {
    return type.split(",").filter((t) => t !== "null").join(" | ");
  }

  return "any";
}

export function generateInstructions(
  schema: z.ZodObject<z.ZodRawShape>,
): string {
  const jsonSchema = zodToJsonSchema(schema, { name: "Response" });
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

      const optional = !required.has(key) || isNullable(prop);
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
