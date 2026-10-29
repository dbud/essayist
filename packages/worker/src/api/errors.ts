// An api failure with a message body. Built-in HttpApiError classes return no body, so the failure
// reason reaches the client only through this error. The client reads the message field from the
// failure body (models/utils/http.ts).

import { Schema } from "effect";

export class ApiFailure extends Schema.TaggedError<ApiFailure>()(
  "ApiFailure",
  { message: Schema.String },
  { description: "ApiFailure", httpApiStatus: 503 },
) {}
