import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export function extractText(response: Anthropic.Message): string {
  const block = response.content[0];
  return block?.type === "text" ? block.text : "";
}
