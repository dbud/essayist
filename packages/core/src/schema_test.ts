import { assertEquals } from "jsr:@std/assert@^1";
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
    `Return JSON matching this shape:

- success: true if successful, false otherwise, boolean, required
- result: the answer, string, optional
- diagnostic: explanation of the result, string, required`,
  );
});

Deno.test("generateInstructions marks nullable fields as optional", () => {
  const schema = z.object({
    value: z.string().nullable(),
  });

  assertEquals(
    generateInstructions(schema),
    `Return JSON matching this shape:

- value: string, optional`,
  );
});

Deno.test("generateInstructions handles enum fields", () => {
  const schema = z.object({
    status: z.enum(["active", "inactive"]),
  });

  assertEquals(
    generateInstructions(schema),
    `Return JSON matching this shape:

- status: one of "active", "inactive", string, required`,
  );
});

Deno.test("generateInstructions handles array fields", () => {
  const schema = z.object({
    tags: z.array(z.string()),
  });

  assertEquals(
    generateInstructions(schema),
    `Return JSON matching this shape:

- tags: string array, required`,
  );
});

Deno.test("generateInstructions handles optional fields", () => {
  const schema = z.object({
    name: z.string(),
    nickname: z.string().optional(),
  });

  assertEquals(
    generateInstructions(schema),
    `Return JSON matching this shape:

- name: string, required
- nickname: string, optional`,
  );
});

Deno.test("generateInstructions handles union types", () => {
  const schema = z.object({
    value: z.union([z.string(), z.number()]),
  });

  assertEquals(
    generateInstructions(schema),
    `Return JSON matching this shape:

- value: string | number, required`,
  );
});

Deno.test("generateInstructions handles nullable arrays", () => {
  const schema = z.object({
    items: z.array(z.string()).nullable(),
  });

  assertEquals(
    generateInstructions(schema),
    `Return JSON matching this shape:

- items: string array, optional`,
  );
});

Deno.test("generateInstructions handles optional arrays", () => {
  const schema = z.object({
    items: z.array(z.string()).optional(),
  });

  assertEquals(
    generateInstructions(schema),
    `Return JSON matching this shape:

- items: string array, optional`,
  );
});

Deno.test("generateInstructions handles record types", () => {
  const schema = z.object({
    metadata: z.record(z.string()),
  });

  assertEquals(
    generateInstructions(schema),
    `Return JSON matching this shape:

- metadata: string record, required`,
  );
});

Deno.test("generateInstructions handles literal types", () => {
  const schema = z.object({
    type: z.literal("article"),
  });

  assertEquals(
    generateInstructions(schema),
    `Return JSON matching this shape:

- type: literal "article", string, required`,
  );
});

Deno.test("generateInstructions handles default values", () => {
  const schema = z.object({
    name: z.string(),
    status: z.string().default("active"),
  });

  assertEquals(
    generateInstructions(schema),
    `Return JSON matching this shape:

- name: string, required
- status: string, optional, default: "active"`,
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
    `Return JSON matching this shape:

- user: object, optional`,
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
