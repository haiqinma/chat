import { buildTokenScopedRouterModelCatalog } from "../app/components/router-model-catalog";
import { ServiceProvider } from "../app/constant";
import type { LLMModel } from "../app/client/api";

function model(name: string, providerName: ServiceProvider, extra = {}) {
  return {
    name,
    available: true,
    sorted: 1,
    provider: {
      id: providerName.toLowerCase(),
      providerName,
      providerType: providerName.toLowerCase(),
      sorted: 1,
    },
    ...extra,
  } as LLMModel;
}

describe("buildTokenScopedRouterModelCatalog", () => {
  test("does not expand token-scoped models with provider catalog models", () => {
    const tokenModels = [model("qwen-plus", ServiceProvider.Alibaba)];
    const providerModels = [
      model("qwen-plus", ServiceProvider.Alibaba, {
        tags: ["reasoning"],
        description: "Qwen Plus",
      }),
      model("gpt-4.1", ServiceProvider.OpenAI),
    ];

    const catalog = buildTokenScopedRouterModelCatalog(
      tokenModels,
      providerModels,
    );

    expect(catalog.map((item) => item.name)).toEqual(["qwen-plus"]);
    expect(catalog[0].tags).toEqual(["reasoning"]);
    expect(catalog[0].description).toBe("Qwen Plus");
  });

  test("does not merge ambiguous same-name provider metadata", () => {
    const tokenModels = [model("shared-model", ServiceProvider.OpenAI)];
    const providerModels = [
      model("shared-model", ServiceProvider.Alibaba, {
        tags: ["qwen"],
      }),
      model("shared-model", ServiceProvider.Google, {
        tags: ["gemini"],
      }),
    ];

    const catalog = buildTokenScopedRouterModelCatalog(
      tokenModels,
      providerModels,
    );

    expect(catalog).toHaveLength(1);
    expect(catalog[0].tags).toBeUndefined();
  });
});
