import { assertEquals } from "@std/assert";
import { Schema } from "effect";
import { test } from "vitest";

import { generateInstructions, stripMarkdownFences } from "./schema.ts";

const HEADER =
  "Return only one valid JSON object matching this shape. Do not use markdown fences, code blocks, comments, or any extra text:";

test("generateInstructions produces correct output for modelResponseSchema", () => {
  const schema = Schema.Struct({
    success: Schema.Boolean.annotate({
      description: "true if successful, false otherwise",
    }),
    result: Schema.NullOr(Schema.String).annotate({
      description: "the answer",
    }),
    diagnostic: Schema.String.annotate({
      description: "explanation of the result",
    }),
  });

  assertEquals(
    generateInstructions(schema),
    `${HEADER}

- success: boolean -- true if successful, false otherwise
- result: string, nullable -- the answer
- diagnostic: string -- explanation of the result`,
  );
});

test("generateInstructions includes example when includeExample is true", () => {
  const schema = Schema.Struct({
    success: Schema.Boolean.annotate({
      description: "ok",
      examples: [true],
    }),
    result: Schema.NullOr(Schema.String).annotate({
      description: "answer",
      examples: ["Paris"],
    }),
    diagnostic: Schema.String.annotate({
      description: "info",
      examples: ["Found capital"],
    }),
  });

  assertEquals(
    generateInstructions(schema, { includeExample: true }),
    `${HEADER}

- success: boolean -- ok
- result: string, nullable -- answer
- diagnostic: string -- info

Example:
{
  "success": true,
  "result": "Paris",
  "diagnostic": "Found capital"
}`,
  );
});

test("generateInstructions marks nullable fields as nullable", () => {
  const schema = Schema.Struct({
    value: Schema.NullOr(Schema.String),
  });

  assertEquals(
    generateInstructions(schema),
    `${HEADER}

- value: string, nullable`,
  );
});

test("generateInstructions handles optional fields", () => {
  const schema = Schema.Struct({
    name: Schema.String,
    nickname: Schema.optionalKey(Schema.String),
  });

  assertEquals(
    generateInstructions(schema),
    `${HEADER}

- name: string
- nickname: string, optional`,
  );
});

test("generateInstructions handles enum fields", () => {
  const schema = Schema.Struct({
    status: Schema.Literals(["active", "inactive"]),
  });

  assertEquals(
    generateInstructions(schema),
    `${HEADER}

- status: one of "active", "inactive", string`,
  );
});

test("generateInstructions handles array fields", () => {
  const schema = Schema.Struct({
    tags: Schema.Array(Schema.String),
  });

  assertEquals(
    generateInstructions(schema),
    `${HEADER}

- tags: string array`,
  );
});

test("generateInstructions handles union types", () => {
  const schema = Schema.Struct({
    value: Schema.Union([Schema.String, Schema.Number]),
  });

  assertEquals(
    generateInstructions(schema),
    `${HEADER}

- value: string | number`,
  );
});

test("generateInstructions handles nullable arrays", () => {
  const schema = Schema.Struct({
    items: Schema.NullOr(Schema.Array(Schema.String)),
  });

  assertEquals(
    generateInstructions(schema),
    `${HEADER}

- items: string array, nullable`,
  );
});

test("generateInstructions handles optional arrays", () => {
  const schema = Schema.Struct({
    items: Schema.optionalKey(Schema.Array(Schema.String)),
  });

  assertEquals(
    generateInstructions(schema),
    `${HEADER}

- items: string array, optional`,
  );
});

test("generateInstructions handles record types", () => {
  const schema = Schema.Struct({
    metadata: Schema.Record(Schema.String, Schema.String),
  });

  assertEquals(
    generateInstructions(schema),
    `${HEADER}

- metadata: string record`,
  );
});

test("generateInstructions handles literal types", () => {
  const schema = Schema.Struct({
    type: Schema.Literal("article"),
  });

  assertEquals(
    generateInstructions(schema),
    `${HEADER}

- type: literal "article", string`,
  );
});

test("generateInstructions handles default values", () => {
  const schema = Schema.Struct({
    name: Schema.String,
    status: Schema.String.annotate({ default: "active" }),
  });

  assertEquals(
    generateInstructions(schema),
    `${HEADER}

- name: string
- status: string, default: "active"`,
  );
});

test("generateInstructions handles nullable objects", () => {
  const schema = Schema.Struct({
    user: Schema.NullOr(
      Schema.Struct({
        name: Schema.String,
      }),
    ),
  });

  assertEquals(
    generateInstructions(schema),
    `${HEADER}

- user: object, nullable
  - name: string`,
  );
});

test("generateInstructions lists the fields of a nested object", () => {
  const schema = Schema.Struct({
    user: Schema.Struct({
      name: Schema.String,
      age: Schema.optionalKey(Schema.Number),
    }),
  });

  assertEquals(
    generateInstructions(schema),
    `${HEADER}

- user: object
  - name: string
  - age: number, optional`,
  );
});

test("generateInstructions lists the fields of an array of objects", () => {
  const schema = Schema.Struct({
    outline: Schema.Array(
      Schema.Struct({
        first_line: Schema.Int.annotate({
          description: "Where the section starts.",
        }),
        gist: Schema.String.annotate({
          description: "What the section does.",
        }),
      }),
    ),
  });

  assertEquals(
    generateInstructions(schema),
    `${HEADER}

- outline: object array
  - first_line: integer -- Where the section starts.
  - gist: string -- What the section does.`,
  );
});

test("generateInstructions recurses through nested arrays of objects", () => {
  const schema = Schema.Struct({
    groups: Schema.Array(
      Schema.Struct({
        title: Schema.String,
        items: Schema.Array(Schema.Struct({ id: Schema.String, qty: Schema.Number })),
      }),
    ),
  });

  assertEquals(
    generateInstructions(schema),
    `${HEADER}

- groups: object array
  - title: string
  - items: object array
    - id: string
    - qty: number`,
  );
});

test("generateInstructions prefers a whole-value example over per-field ones", () => {
  const schema = Schema.Struct({
    outline: Schema.Array(Schema.Struct({ first_line: Schema.Int })),
  }).annotate({
    examples: [{ outline: [{ first_line: 3 }] }],
  });

  assertEquals(
    generateInstructions(schema, { includeExample: true }),
    `${HEADER}

- outline: object array
  - first_line: integer

Example:
{
  "outline": [
    {
      "first_line": 3
    }
  ]
}`,
  );
});

test("generateInstructions lists the fields of a nullable object", () => {
  // A nullable object is the object unioned with null, so the union has to be unwrapped before the
  // fields are read.
  const schema = Schema.Struct({
    user: Schema.NullOr(Schema.Struct({ name: Schema.String })),
    tags: Schema.NullOr(Schema.Array(Schema.String)),
  });

  assertEquals(
    generateInstructions(schema),
    `${HEADER}

- user: object, nullable
  - name: string
- tags: string array, nullable`,
  );
});

test("generateInstructions describes a record by its value type, not its keys", () => {
  const schema = Schema.Struct({
    scores: Schema.Array(Schema.Record(Schema.String, Schema.Number)),
  });

  assertEquals(
    generateInstructions(schema),
    `${HEADER}

- scores: number record array`,
  );
});

test("generateInstructions handles tuple types", () => {
  const schema = Schema.Struct({
    coords: Schema.Tuple([Schema.Number, Schema.Number]),
  });

  assertEquals(
    generateInstructions(schema),
    `${HEADER}

- coords: (number, number) tuple`,
  );
});

test("generateInstructions handles boolean fields", () => {
  const schema = Schema.Struct({
    active: Schema.Boolean,
  });

  assertEquals(
    generateInstructions(schema),
    `${HEADER}

- active: boolean`,
  );
});

test("generateInstructions handles number fields", () => {
  const schema = Schema.Struct({
    count: Schema.Number,
  });

  assertEquals(
    generateInstructions(schema),
    `${HEADER}

- count: number`,
  );
});

test("stripMarkdownFences removes json code fences", () => {
  assertEquals(stripMarkdownFences('```json\n{"key": "value"}\n```'), '{"key": "value"}');
});

test("stripMarkdownFences removes plain code fences", () => {
  assertEquals(stripMarkdownFences('```\n{"key": "value"}\n```'), '{"key": "value"}');
});

test("stripMarkdownFences handles text without fences", () => {
  assertEquals(stripMarkdownFences('{"key": "value"}'), '{"key": "value"}');
});

test("stripMarkdownFences trims whitespace around fences", () => {
  assertEquals(stripMarkdownFences('  ```json\n{"key": "value"}\n```  '), '{"key": "value"}');
});
