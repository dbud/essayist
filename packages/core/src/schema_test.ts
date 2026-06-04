import { assertEquals } from "@std/assert";
import { z } from "zod";
import { generateInstructions, stripMarkdownFences } from "./schema.ts";

Deno.test("generateInstructions produces correct output for modelResponseSchema", () => {
  const schema = z.object({
    success: z.boolean().describe("true if successful, false otherwise"),
    result: z.string().nullable().describe("the answer"),
    diagnostic: z.string().describe("explanation of the result"),
  });

  assertEquals(
    generateInstructions(schema),
    `Return only one valid JSON object matching this shape. Do not use markdown fences, code blocks, comments, or any extra text:

- success: true if successful, false otherwise, boolean
- result: the answer, string, nullable
- diagnostic: explanation of the result, string`,
  );
});

Deno.test("generateInstructions includes example when includeExample is true", () => {
  const schema = z.object({
    success: z.boolean().describe("ok").meta({ example: true }),
    result: z.string().nullable().describe("answer").meta({ example: "Paris" }),
    diagnostic: z.string().describe("info").meta({ example: "Found capital" }),
  });

  assertEquals(
    generateInstructions(schema, { includeExample: true }),
    `Return only one valid JSON object matching this shape. Do not use markdown fences, code blocks, comments, or any extra text:

- success: ok, boolean
- result: answer, string, nullable
- diagnostic: info, string

Example:
{
  "success": true,
  "result": "Paris",
  "diagnostic": "Found capital"
}`,
  );
});

Deno.test("generateInstructions marks nullable fields as nullable", () => {
  const schema = z.object({
    value: z.string().nullable(),
  });

  assertEquals(
    generateInstructions(schema),
    `Return only one valid JSON object matching this shape. Do not use markdown fences, code blocks, comments, or any extra text:

- value: string, nullable`,
  );
});

Deno.test("generateInstructions handles optional fields", () => {
  const schema = z.object({
    name: z.string(),
    nickname: z.string().optional(),
  });

  assertEquals(
    generateInstructions(schema),
    `Return only one valid JSON object matching this shape. Do not use markdown fences, code blocks, comments, or any extra text:

- name: string
- nickname: string, optional`,
  );
});

Deno.test("generateInstructions handles enum fields", () => {
  const schema = z.object({
    status: z.enum(["active", "inactive"]),
  });

  assertEquals(
    generateInstructions(schema),
    `Return only one valid JSON object matching this shape. Do not use markdown fences, code blocks, comments, or any extra text:

- status: one of "active", "inactive", string`,
  );
});

Deno.test("generateInstructions handles array fields", () => {
  const schema = z.object({
    tags: z.array(z.string()),
  });

  assertEquals(
    generateInstructions(schema),
    `Return only one valid JSON object matching this shape. Do not use markdown fences, code blocks, comments, or any extra text:

- tags: string array`,
  );
});

Deno.test("generateInstructions handles union types", () => {
  const schema = z.object({
    value: z.union([z.string(), z.number()]),
  });

  assertEquals(
    generateInstructions(schema),
    `Return only one valid JSON object matching this shape. Do not use markdown fences, code blocks, comments, or any extra text:

- value: string | number`,
  );
});

Deno.test("generateInstructions handles nullable arrays", () => {
  const schema = z.object({
    items: z.array(z.string()).nullable(),
  });

  assertEquals(
    generateInstructions(schema),
    `Return only one valid JSON object matching this shape. Do not use markdown fences, code blocks, comments, or any extra text:

- items: string array, nullable`,
  );
});

Deno.test("generateInstructions handles optional arrays", () => {
  const schema = z.object({
    items: z.array(z.string()).optional(),
  });

  assertEquals(
    generateInstructions(schema),
    `Return only one valid JSON object matching this shape. Do not use markdown fences, code blocks, comments, or any extra text:

- items: string array, optional`,
  );
});

Deno.test("generateInstructions handles record types", () => {
  const schema = z.object({
    metadata: z.record(z.string(), z.string()),
  });

  assertEquals(
    generateInstructions(schema),
    `Return only one valid JSON object matching this shape. Do not use markdown fences, code blocks, comments, or any extra text:

- metadata: string record`,
  );
});

Deno.test("generateInstructions handles literal types", () => {
  const schema = z.object({
    type: z.literal("article", { error: "must be article" }),
  });

  assertEquals(
    generateInstructions(schema),
    `Return only one valid JSON object matching this shape. Do not use markdown fences, code blocks, comments, or any extra text:

- type: literal "article", string`,
  );
});

Deno.test("generateInstructions handles default values", () => {
  const schema = z.object({
    name: z.string(),
    status: z.string().default("active"),
  });

  assertEquals(
    generateInstructions(schema),
    `Return only one valid JSON object matching this shape. Do not use markdown fences, code blocks, comments, or any extra text:

- name: string
- status: string, default: "active"`,
  );
});

Deno.test("generateInstructions handles nullable objects", () => {
  const schema = z.object({
    user: z.object({
      name: z.string(),
    }).nullable(),
  });

  assertEquals(
    generateInstructions(schema),
    `Return only one valid JSON object matching this shape. Do not use markdown fences, code blocks, comments, or any extra text:

- user: object, nullable`,
  );
});

Deno.test("generateInstructions handles intersection types", () => {
  const schema = z.object({
    value: z.intersection(
      z.object({ name: z.string() }),
      z.object({ age: z.number() }),
    ),
  });

  assertEquals(
    generateInstructions(schema),
    `Return only one valid JSON object matching this shape. Do not use markdown fences, code blocks, comments, or any extra text:

- value: intersection`,
  );
});

Deno.test("generateInstructions handles tuple types", () => {
  const schema = z.object({
    coords: z.tuple([z.number(), z.number()]),
  });

  assertEquals(
    generateInstructions(schema),
    `Return only one valid JSON object matching this shape. Do not use markdown fences, code blocks, comments, or any extra text:

- coords: (number, number) tuple`,
  );
});

Deno.test("generateInstructions handles boolean fields", () => {
  const schema = z.object({
    active: z.boolean(),
  });

  assertEquals(
    generateInstructions(schema),
    `Return only one valid JSON object matching this shape. Do not use markdown fences, code blocks, comments, or any extra text:

- active: boolean`,
  );
});

Deno.test("generateInstructions handles number fields", () => {
  const schema = z.object({
    count: z.number(),
  });

  assertEquals(
    generateInstructions(schema),
    `Return only one valid JSON object matching this shape. Do not use markdown fences, code blocks, comments, or any extra text:

- count: number`,
  );
});

Deno.test("stripMarkdownFences removes json code fences", () => {
  assertEquals(
    stripMarkdownFences('```json\n{"key": "value"}\n```'),
    '{"key": "value"}',
  );
});

Deno.test("stripMarkdownFences removes plain code fences", () => {
  assertEquals(
    stripMarkdownFences('```\n{"key": "value"}\n```'),
    '{"key": "value"}',
  );
});

Deno.test("stripMarkdownFences handles text without fences", () => {
  assertEquals(
    stripMarkdownFences('{"key": "value"}'),
    '{"key": "value"}',
  );
});

Deno.test("stripMarkdownFences trims whitespace around fences", () => {
  assertEquals(
    stripMarkdownFences('  ```json\n{"key": "value"}\n```  '),
    '{"key": "value"}',
  );
});
