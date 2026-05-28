import { useMemo } from "react";
import { ServiceProvider } from "@/app/constant";
import {
  LLMModel,
  supportsImageEditEndpoint,
  supportsImageGenerationEndpoint,
  supportsTextEndpoint,
} from "../client/api";
import { ModalConfigValidator, ModelConfig } from "../store";

import Locale from "../locales";
import { InputRange } from "./input-range";
import { ListItem, Select } from "./ui-lib";
import { useAllModels } from "../utils/hooks";
import { groupBy } from "lodash-es";
import styles from "./model-config.module.scss";
import { getModelProvider, normalizeProviderName } from "../utils/model";

export function ModelConfigList(props: {
  modelConfig: ModelConfig;
  updateConfig: (updater: (config: ModelConfig) => void) => void;
  modelOptions?: LLMModel[];
  strictModelSelection?: boolean;
}) {
  const allModels = useAllModels();
  const baseModelOptions = props.modelOptions ?? allModels;
  const hasModels = baseModelOptions.length > 0;
  const availableModels = useMemo(
    () => baseModelOptions.filter((v: { available: any }) => v.available),
    [baseModelOptions],
  );
  const groupModels = useMemo(
    () => groupBy(availableModels, "provider.providerName"),
    [availableModels],
  );

  const configuredProviderName =
    normalizeProviderName(props.modelConfig?.providerName) ??
    props.modelConfig?.providerName;
  const configuredValue = hasModels
    ? `${props.modelConfig.model}@${configuredProviderName}`
    : "";
  const exactMatch = availableModels.some(
    (m) => `${m.name}@${m.provider?.providerName}` === configuredValue,
  );
  const fallbackMatch = availableModels.find(
    (m) => m.name === props.modelConfig.model,
  );
  const value = props.strictModelSelection
    ? hasModels
      ? configuredValue
      : ""
    : hasModels
      ? exactMatch
        ? configuredValue
        : fallbackMatch
          ? `${fallbackMatch.name}@${fallbackMatch.provider?.providerName}`
          : availableModels[0]
            ? `${availableModels[0].name}@${availableModels[0].provider?.providerName}`
            : ""
      : "";
  const compressModelValue = `${props.modelConfig.compressModel}@${props.modelConfig?.compressProviderName}`;
  const textModelOptions = useMemo(
    () =>
      allModels.filter((model) => {
        if (!model.available) return false;
        const runtimeModel = model as LLMModel;
        const endpoints = runtimeModel.supportedEndpoints ?? [];
        if (endpoints.length > 0) return supportsTextEndpoint(endpoints);
        const tags = runtimeModel.tags ?? [];
        const imageOnly =
          tags.includes("image") ||
          runtimeModel.modelType === "image" ||
          supportsImageGenerationEndpoint(endpoints) ||
          supportsImageEditEndpoint(endpoints);
        return !imageOnly;
      }),
    [allModels],
  );
  const selectedCompressModelValue = props.modelConfig.compressModel
    ? compressModelValue
    : "";

  return (
    <>
      <ListItem title={Locale.Settings.Model}>
        <Select
          aria-label={Locale.Settings.Model}
          value={value}
          align="left"
          onChange={(e) => {
            const [model, providerName] = getModelProvider(
              e.currentTarget.value,
            );
            props.updateConfig((config) => {
              config.model = ModalConfigValidator.model(model);
              config.providerName = providerName as ServiceProvider;
            });
          }}
        >
          {!hasModels ? (
            <option value="" disabled>
              {Locale.SearchChat.Page.Loading}
            </option>
          ) : null}
          {hasModels &&
          props.strictModelSelection &&
          configuredValue &&
          !exactMatch ? (
            <option value={configuredValue}>
              {props.modelConfig.model}
              {configuredProviderName ? ` (${configuredProviderName})` : ""}
            </option>
          ) : null}
          {Object.keys(groupModels).map((providerName, index) => (
            <optgroup label={providerName} key={index}>
              {groupModels[providerName].map((v, i) => (
                <option
                  value={`${v.name}@${v.provider?.providerName ?? ServiceProvider.OpenAI}`}
                  key={i}
                >
                  {v.displayName}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </ListItem>
      <ListItem
        title={Locale.Settings.Temperature.Title}
        subTitle={Locale.Settings.Temperature.SubTitle}
      >
        <InputRange
          aria={Locale.Settings.Temperature.Title}
          value={props.modelConfig.temperature?.toFixed(1)}
          min="0"
          max="1" // lets limit it to 0-1
          step="0.1"
          onChange={(e) => {
            props.updateConfig(
              (config) =>
                (config.temperature = ModalConfigValidator.temperature(
                  e.currentTarget.valueAsNumber,
                )),
            );
          }}
        ></InputRange>
      </ListItem>
      <ListItem
        title={Locale.Settings.TopP.Title}
        subTitle={Locale.Settings.TopP.SubTitle}
      >
        <InputRange
          aria={Locale.Settings.TopP.Title}
          value={(props.modelConfig.top_p ?? 1).toFixed(1)}
          min="0"
          max="1"
          step="0.1"
          onChange={(e) => {
            props.updateConfig(
              (config) =>
                (config.top_p = ModalConfigValidator.top_p(
                  e.currentTarget.valueAsNumber,
                )),
            );
          }}
        ></InputRange>
      </ListItem>
      <ListItem
        title={Locale.Settings.MaxTokens.Title}
        subTitle={Locale.Settings.MaxTokens.SubTitle}
      >
        <input
          aria-label={Locale.Settings.MaxTokens.Title}
          type="number"
          min={1024}
          max={512000}
          value={props.modelConfig.max_tokens}
          onChange={(e) =>
            props.updateConfig(
              (config) =>
                (config.max_tokens = ModalConfigValidator.max_tokens(
                  e.currentTarget.valueAsNumber,
                )),
            )
          }
        ></input>
      </ListItem>

      {props.modelConfig?.providerName == ServiceProvider.Google ? null : (
        <>
          <ListItem
            title={Locale.Settings.PresencePenalty.Title}
            subTitle={Locale.Settings.PresencePenalty.SubTitle}
          >
            <InputRange
              aria={Locale.Settings.PresencePenalty.Title}
              value={props.modelConfig.presence_penalty?.toFixed(1)}
              min="-2"
              max="2"
              step="0.1"
              onChange={(e) => {
                props.updateConfig(
                  (config) =>
                    (config.presence_penalty =
                      ModalConfigValidator.presence_penalty(
                        e.currentTarget.valueAsNumber,
                      )),
                );
              }}
            ></InputRange>
          </ListItem>

          <ListItem
            title={Locale.Settings.FrequencyPenalty.Title}
            subTitle={Locale.Settings.FrequencyPenalty.SubTitle}
          >
            <InputRange
              aria={Locale.Settings.FrequencyPenalty.Title}
              value={props.modelConfig.frequency_penalty?.toFixed(1)}
              min="-2"
              max="2"
              step="0.1"
              onChange={(e) => {
                props.updateConfig(
                  (config) =>
                    (config.frequency_penalty =
                      ModalConfigValidator.frequency_penalty(
                        e.currentTarget.valueAsNumber,
                      )),
                );
              }}
            ></InputRange>
          </ListItem>

          <ListItem
            title={Locale.Settings.InjectSystemPrompts.Title}
            subTitle={Locale.Settings.InjectSystemPrompts.SubTitle}
          >
            <input
              aria-label={Locale.Settings.InjectSystemPrompts.Title}
              type="checkbox"
              checked={props.modelConfig.enableInjectSystemPrompts}
              onChange={(e) =>
                props.updateConfig(
                  (config) =>
                    (config.enableInjectSystemPrompts =
                      e.currentTarget.checked),
                )
              }
            ></input>
          </ListItem>

          <ListItem
            title={Locale.Settings.InputTemplate.Title}
            subTitle={Locale.Settings.InputTemplate.SubTitle}
          >
            <input
              aria-label={Locale.Settings.InputTemplate.Title}
              type="text"
              value={props.modelConfig.template}
              onChange={(e) =>
                props.updateConfig(
                  (config) => (config.template = e.currentTarget.value),
                )
              }
            ></input>
          </ListItem>
        </>
      )}
      <ListItem
        title={Locale.Settings.HistoryCount.Title}
        subTitle={Locale.Settings.HistoryCount.SubTitle}
      >
        <InputRange
          aria={Locale.Settings.HistoryCount.Title}
          title={props.modelConfig.historyMessageCount.toString()}
          value={props.modelConfig.historyMessageCount}
          min="0"
          max="64"
          step="1"
          onChange={(e) =>
            props.updateConfig(
              (config) => (config.historyMessageCount = e.target.valueAsNumber),
            )
          }
        ></InputRange>
      </ListItem>

      <ListItem
        title={Locale.Settings.CompressThreshold.Title}
        subTitle={Locale.Settings.CompressThreshold.SubTitle}
      >
        <input
          aria-label={Locale.Settings.CompressThreshold.Title}
          type="number"
          min={500}
          max={4000}
          value={props.modelConfig.compressMessageLengthThreshold}
          onChange={(e) =>
            props.updateConfig(
              (config) =>
                (config.compressMessageLengthThreshold =
                  e.currentTarget.valueAsNumber),
            )
          }
        ></input>
      </ListItem>
      <ListItem title={Locale.Memory.Title} subTitle={Locale.Memory.Send}>
        <input
          aria-label={Locale.Memory.Title}
          type="checkbox"
          checked={props.modelConfig.sendMemory}
          onChange={(e) =>
            props.updateConfig(
              (config) => (config.sendMemory = e.currentTarget.checked),
            )
          }
        ></input>
      </ListItem>
      <ListItem
        title={Locale.Settings.CompressModel.Title}
        subTitle={Locale.Settings.CompressModel.SubTitle}
      >
        <Select
          className={styles["select-compress-model"]}
          aria-label={Locale.Settings.CompressModel.Title}
          value={selectedCompressModelValue}
          onChange={(e) => {
            if (!e.currentTarget.value) {
              props.updateConfig((config) => {
                config.compressModel = "";
                config.compressProviderName = "";
              });
              return;
            }
            const [model, providerName] = getModelProvider(
              e.currentTarget.value,
            );
            props.updateConfig((config) => {
              config.compressModel = ModalConfigValidator.model(model);
              config.compressProviderName = providerName as ServiceProvider;
            });
          }}
        >
          <option value="">{Locale.Settings.CompressModel.Auto}</option>
          {textModelOptions.map((v: LLMModel, i: number) => (
            <option
              value={`${v.name}@${v.provider?.providerName ?? ServiceProvider.OpenAI}`}
              key={i}
            >
              {v.displayName}({v.provider?.providerName})
            </option>
          ))}
        </Select>
      </ListItem>
    </>
  );
}
