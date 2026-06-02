import { z } from "zod";

type FieldDescription = {
  name: string;
  type: string;
  description?: string;
};

function describeField(name: string, def: z.ZodTypeAny): FieldDescription {
  const type = def._def.typeName === "ZodOptional"
    ? def._def.innerType._def.typeName
    : def._def.typeName;
  const tsType = type === "ZodBoolean"
    ? "boolean"
    : type === "ZodNumber"
    ? "number"
    : "string";
  return { name, type: tsType, description: def.description };
}

export function describeShape(
  schema: z.ZodObject<z.ZodRawShape>,
): FieldDescription[] {
  return Object.entries(schema.shape).map(([name, def]) =>
    describeField(name, def)
  );
}

export function formatFields(fields: FieldDescription[]): string {
  return fields.map((f) =>
    `  "${f.name}": ${f.type}${f.description ? ` -- ${f.description}` : ""}`
  ).join(",\n");
}

export function generateInstructions(
  schema: z.ZodObject<z.ZodRawShape>,
): string {
  return `Respond with raw JSON only. Do not use markdown, code fences, or any other formatting.
    {
    ${formatFields(describeShape(schema))}
    }`;
}

export function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```$/m, "")
    .trim();
}
