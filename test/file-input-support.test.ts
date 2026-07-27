import {
  normalizeSupportedEndpoints,
  selectPreferredRequestEndpoint,
  SupportedTextEndpoint,
} from "../app/client/endpoints";
import { normalizeResponsesInputMessages } from "../app/client/responses-input";

describe("file input support", () => {
  test("requires responses endpoint for document attachment flows", () => {
    expect(
      selectPreferredRequestEndpoint(
        [
          SupportedTextEndpoint.ChatCompletions,
          SupportedTextEndpoint.Responses,
        ],
        { requireResponses: true, modelName: "router-file-model" },
      ),
    ).toBe(SupportedTextEndpoint.Responses);

    expect(
      selectPreferredRequestEndpoint([SupportedTextEndpoint.ChatCompletions], {
        requireResponses: true,
        modelName: "chat-only-model",
      }),
    ).toBeUndefined();
  });

  test("keeps router file_input tags as explicit model metadata", () => {
    const tags = ["text", "file_input", "pdf_input"].map((tag) =>
      tag.trim().toLowerCase(),
    );
    const endpoints = normalizeSupportedEndpoints([
      SupportedTextEndpoint.Responses,
    ]);

    expect(tags).toContain("file_input");
    expect(endpoints).toEqual([SupportedTextEndpoint.Responses]);
  });

  test("converts PDF file_url content into Responses input_file content", () => {
    const input = [
      {
        role: "user",
        content: [
          { type: "text", text: "Summarize this PDF." },
          {
            type: "file_url",
            file_url: {
              url: "https://webdav.example.test/api/v1/public/share/token/report.pdf",
              name: "report.pdf",
              mime_type: "application/pdf",
            },
          },
        ],
      },
    ];

    expect(normalizeResponsesInputMessages(input)).toEqual([
      {
        role: "user",
        content: [
          { type: "input_text", text: "Summarize this PDF." },
          {
            type: "input_file",
            file_url:
              "https://webdav.example.test/api/v1/public/share/token/report.pdf",
            filename: "report.pdf",
          },
        ],
      },
    ]);
  });
});
