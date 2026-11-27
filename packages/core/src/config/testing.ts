/** Config items for tests, built with the optional fields left out rather than set to none. */

import { Option } from "effect";

import { Category, ReviewPass } from "./types.ts";

export const category = ({
  description,
  severity,
  color,
  ...fields
}: {
  id: string;
  label: string;
  description?: string;
  severity?: string;
  color?: string;
}) =>
  new Category({
    ...fields,
    description: Option.fromUndefinedOr(description),
    severity: Option.fromUndefinedOr(severity),
    color: Option.fromUndefinedOr(color),
  });

export const reviewPass = ({
  variables,
  ...fields
}: Omit<ReviewPass, "variables"> & { variables?: Record<string, string> }) =>
  new ReviewPass({ ...fields, variables: Option.fromUndefinedOr(variables) });
