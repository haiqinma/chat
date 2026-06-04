import {
  selectPreferredRequestEndpoint,
  selectPreferredTextEndpoint,
  SupportedEndpoint,
  SupportedTextEndpoint,
} from "../app/client/endpoints";

describe("selectPreferredTextEndpoint", () => {
  test("prefers responses by default when both endpoints are supported", () => {
    const endpoint = selectPreferredTextEndpoint([
      SupportedTextEndpoint.Responses,
      SupportedTextEndpoint.ChatCompletions,
    ]);

    expect(endpoint).toBe(SupportedTextEndpoint.Responses);
  });

  test("prefers chat completions when explicitly requested", () => {
    const endpoint = selectPreferredTextEndpoint(
      [SupportedTextEndpoint.ChatCompletions, SupportedTextEndpoint.Responses],
      { preferResponses: false },
    );

    expect(endpoint).toBe(SupportedTextEndpoint.ChatCompletions);
  });

  test("prefers responses for gpt series even when chat completions is requested", () => {
    const endpoint = selectPreferredTextEndpoint(
      [SupportedTextEndpoint.ChatCompletions, SupportedTextEndpoint.Responses],
      { preferResponses: false, modelName: "gpt-5.4" },
    );

    expect(endpoint).toBe(SupportedTextEndpoint.Responses);
  });

  test("falls back to image generations when only the image endpoint is supported", () => {
    const endpoint = selectPreferredRequestEndpoint([
      SupportedEndpoint.ImagesGenerations,
    ]);

    expect(endpoint).toBe(SupportedEndpoint.ImagesGenerations);
  });
});
