import { OpenRouter } from "@openrouter/sdk";

const MODEL = "openrouter/owl-alpha";

export class Agent {
  #client: OpenRouter;

  constructor(apiKey: string) {
    this.#client = new OpenRouter({ apiKey });
  }

  callModel(input: string) {
    return this.#client.callModel({ model: MODEL, input });
  }
}
