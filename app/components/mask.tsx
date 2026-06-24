import { IconButton } from "./button";
import { ErrorBoundary } from "./error";

import styles from "./mask.module.scss";

import DownloadIcon from "../icons/download.svg";
import UploadIcon from "../icons/upload.svg";
import EditIcon from "../icons/edit.svg";
import AddIcon from "../icons/add.svg";
import CloseIcon from "../icons/close.svg";
import DeleteIcon from "../icons/delete.svg";
import EyeIcon from "../icons/eye.svg";
import CopyIcon from "../icons/copy.svg";
import DragIcon from "../icons/drag.svg";

import {
  DEFAULT_SKILL_AVATAR,
  Skill,
  allowSkillNativeToolBridge,
  getSkillBuiltInTools,
  getSkillToolServers,
  getSkillSessionToolbar,
  getLaunchableSkills,
  syncSkillLegacyPlugin,
  useSkillStore,
} from "../store/skill";
import { useSdStore } from "../store/sd";
import {
  ChatMessage,
  createMessage,
  ModelConfig,
  ModelType,
  useAppConfig,
  useChatStore,
} from "../store";
import {
  createDefaultRealtimeConfig,
  type RealtimeConfig,
} from "../store/realtime";
import { LLMModel, MultimodalContent, ROLES } from "../client/api";
import {
  Input,
  List,
  ListItem,
  Modal,
  Popover,
  Select,
  Selector,
  showConfirm,
} from "./ui-lib";
import { Avatar, AvatarPicker } from "./emoji";
import Locale, { AllLangs, ALL_LANG_OPTIONS, Lang } from "../locales";
import { useLocation, useNavigate } from "react-router-dom";

import chatStyle from "./chat.module.scss";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  copyToClipboard,
  downloadAs,
  getMessageImages,
  readFromFile,
} from "../utils";
import { Updater } from "../typing";
import { ModelConfigList } from "./model-config";
import { FileName, Path } from "../constant";
import {
  BUILTIN_SKILL_STORE,
  type SkillPackage,
  resolveLocalizedText,
  skillToSkillPackage,
} from "../skills";
import {
  DragDropContext,
  Droppable,
  Draggable,
  OnDragEndResponder,
} from "@hello-pangea/dnd";
import { getMessageTextContent } from "../utils";
import clsx from "clsx";
import { Markdown } from "./markdown";
import { useMaskProviderModels } from "../utils/hooks";
import {
  buildModelCandidateValue,
  filterModelsByCandidates,
  getModelProvider,
  normalizeModelCandidates,
} from "../utils/model";
import { OFFICIAL_TOOL_PRESET_SERVERS } from "../tools/preset-servers";
import { RealtimeConfigList } from "./realtime-chat/realtime-config";

type SkillPackageList = Partial<Record<Lang, SkillPackage[]>>;

const BUILT_IN_SKILL_TOOL_ITEMS = [
  {
    id: "web_search" as const,
    name: "Web Search",
    description: "OpenAI Responses built-in web search",
  },
];

function getSkillPackageId(skill: Skill) {
  if (skill.packageId) return skill.packageId;
  return skill.builtin ? `builtin.${skill.lang}.${skill.createdAt}` : skill.id;
}

function useSkillPackageList() {
  const [packageList, setPackageList] = useState<SkillPackageList>({});

  useEffect(() => {
    let cancelled = false;
    fetch("/skill-packages.json")
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setPackageList(data);
      })
      .catch((error) => {
        console.warn("[Skill] failed to load skill package list", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return packageList;
}

function useSkillPackage(skill: Skill) {
  const packageList = useSkillPackageList();
  return useMemo(() => {
    const packageId = getSkillPackageId(skill);
    const fromPackageList = packageList[skill.lang]?.find((item) => {
      return item.id === packageId;
    });
    return fromPackageList ?? skillToSkillPackage(skill);
  }, [packageList, skill]);
}

function getSkillPackageLabels(lang: Lang) {
  if (lang === "cn") {
    return {
      runtime: "运行方式",
      model: "模型",
      permissions: "权限",
      tools: "工具",
      visibility: "可见范围",
      version: "版本",
      chat: "会话",
      sd: "图片创作",
      external: "外部入口",
      globalModel: "跟随全局模型",
      none: "无",
      noExtraPermissions: "无需额外权限",
      public: "公开",
      organization: "组织",
      private: "私有",
    };
  }

  return {
    runtime: "Runtime",
    model: "Model",
    permissions: "Permissions",
    tools: "Tools",
    visibility: "Visibility",
    version: "Version",
    chat: "Session",
    sd: "Image Creation",
    external: "External",
    globalModel: "Use global model",
    none: "None",
    noExtraPermissions: "No extra permissions",
    public: "Public",
    organization: "Organization",
    private: "Private",
  };
}

function getSkillRuntimeText(
  skillPackage: SkillPackage,
  labels: ReturnType<typeof getSkillPackageLabels>,
) {
  const launch = skillPackage.launch;
  if (!launch || launch.type === "chat") return labels.chat;
  if (launch.type === "external") return labels.external;
  if (launch.target === "sd") return labels.sd;
  if (launch.target === "chat") return labels.chat;
  return launch.target;
}

function getSkillModelText(
  skillPackage: SkillPackage,
  labels: ReturnType<typeof getSkillPackageLabels>,
) {
  const provider = skillPackage.model?.default?.provider;
  const model = skillPackage.model?.default?.model;
  if (!provider && !model) return labels.globalModel;
  return [provider, model].filter(Boolean).join(" / ");
}

function getSkillPermissionsText(
  skillPackage: SkillPackage,
  labels: ReturnType<typeof getSkillPackageLabels>,
) {
  const permissions = skillPackage.permissions;
  if (!permissions) return labels.noExtraPermissions;

  const enabled = [
    permissions.network ? "network" : undefined,
    permissions.filesystem ? "filesystem" : undefined,
    permissions.wallet ? "wallet" : undefined,
    ...(permissions.externalTools ?? []),
    ...(permissions.dataScopes ?? []),
  ].filter(Boolean);

  return enabled.length ? enabled.join(", ") : labels.noExtraPermissions;
}

function getSkillToolsText(
  skillPackage: SkillPackage,
  labels: ReturnType<typeof getSkillPackageLabels>,
  lang: Lang,
) {
  const tools =
    skillPackage.tools?.map((tool) =>
      resolveLocalizedText(tool.name, lang, tool.id),
    ) ?? [];
  const servers =
    skillPackage.toolServers?.map((server) =>
      resolveLocalizedText(server.name, lang, server.id),
    ) ?? [];
  const items = [...tools, ...servers];
  return items.length ? items.join(", ") : labels.none;
}

function getSkillVisibilityText(
  skillPackage: SkillPackage,
  labels: ReturnType<typeof getSkillPackageLabels>,
) {
  const scope = skillPackage.visibility?.scope;
  if (scope === "organization") return labels.organization;
  if (scope === "private") return labels.private;
  return labels.public;
}

function SkillPackageSummary(props: { skill: Skill }) {
  const skillPackage = useSkillPackage(props.skill);
  const labels = getSkillPackageLabels(props.skill.lang);
  const packageName = resolveLocalizedText(
    skillPackage.name,
    props.skill.lang,
    props.skill.name,
  );
  const items = [
    {
      label: labels.runtime,
      value: getSkillRuntimeText(skillPackage, labels),
    },
    {
      label: labels.model,
      value: getSkillModelText(skillPackage, labels),
    },
    {
      label: labels.permissions,
      value: getSkillPermissionsText(skillPackage, labels),
    },
    {
      label: labels.tools,
      value: getSkillToolsText(skillPackage, labels, props.skill.lang),
    },
    {
      label: labels.visibility,
      value: getSkillVisibilityText(skillPackage, labels),
    },
    {
      label: labels.version,
      value: `${skillPackage.version} · ${packageName}`,
    },
  ];

  return (
    <div className={styles["skill-package-summary"]}>
      {items.map((item) => (
        <div className={styles["skill-package-item"]} key={item.label}>
          <div className={styles["skill-package-label"]}>{item.label}</div>
          <div className={styles["skill-package-value"]}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

// drag and drop helper function
function reorder<T>(list: T[], startIndex: number, endIndex: number): T[] {
  const result = [...list];
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
}

const EMOJI_UNIFIED_RE = /^[0-9a-f]+(-[0-9a-f]+)*$/i;

function isEmojiUnified(avatar?: string) {
  return !!avatar && EMOJI_UNIFIED_RE.test(avatar);
}

export function SkillAvatar(props: { avatar: string; model?: ModelType }) {
  const config = useAppConfig();
  const model = props.model || config.modelConfig.model;
  const useEmoji =
    props.avatar &&
    props.avatar !== DEFAULT_SKILL_AVATAR &&
    isEmojiUnified(props.avatar);

  return useEmoji ? <Avatar avatar={props.avatar} /> : <Avatar model={model} />;
}

export const MaskAvatar = SkillAvatar;

export function SkillConfig(props: {
  mask: Skill;
  updateMask: Updater<Skill>;
  extraListItems?: ReactNode;
  readonly?: boolean;
  shouldSyncFromGlobal?: boolean;
  modelOptions?: LLMModel[];
}) {
  const skill = props.mask;
  const [showPicker, setShowPicker] = useState(false);
  const [showCandidateModelSelector, setShowCandidateModelSelector] =
    useState(false);
  const [showBuiltInToolSelector, setShowBuiltInToolSelector] = useState(false);
  const [showToolServerSelector, setShowToolServerSelector] = useState(false);
  const skillProviderModels = useMaskProviderModels();
  const selectedBuiltInTools = getSkillBuiltInTools(skill);
  const selectedToolServers = getSkillToolServers(skill);
  const allowNativeToolBridge = allowSkillNativeToolBridge(skill);
  const toolbar = getSkillSessionToolbar(skill);
  const isRealtimeSkill = toolbar.realtime && Boolean(skill.realtimeConfig);
  const selectedCandidateModels = useMemo(
    () => normalizeModelCandidates(skill.candidateModels),
    [skill.candidateModels],
  );
  const selectedCandidateValues = useMemo(
    () =>
      selectedCandidateModels.map((candidate) =>
        buildModelCandidateValue(candidate),
      ),
    [selectedCandidateModels],
  );
  const baseModelOptions = props.modelOptions ?? skillProviderModels;
  const skillModelOptions = useMemo(() => {
    if (selectedCandidateModels.length === 0) {
      return baseModelOptions;
    }
    return filterModelsByCandidates(baseModelOptions, selectedCandidateModels);
  }, [baseModelOptions, selectedCandidateModels]);
  const candidateModelSummary =
    skillProviderModels.length === 0
      ? Locale.SearchChat.Page.Loading
      : selectedCandidateModels.length === 0
        ? Locale.Mask.Config.CandidateModels.SummaryNone
        : Locale.Mask.Config.CandidateModels.SummarySelected(
            selectedCandidateModels.length,
          );
  const candidateModelSelectorItems = useMemo(
    () =>
      skillProviderModels.map((model) => ({
        title: `${model.displayName}${
          model.provider?.providerName
            ? ` (${model.provider.providerName})`
            : ""
        }`,
        value: buildModelCandidateValue({
          model: model.name,
          providerName: model.provider?.id ?? model.provider?.providerName,
        }),
      })),
    [skillProviderModels],
  );
  const builtInToolSummary =
    selectedBuiltInTools.length === 0
      ? Locale.Mask.Config.Tools.SummaryNone
      : Locale.Mask.Config.Tools.SummarySelected(selectedBuiltInTools.length);
  const toolServerSummary =
    selectedToolServers.length === 0
      ? Locale.Mask.Config.Tools.SummaryNone
      : Locale.Mask.Config.Tools.SummarySelected(selectedToolServers.length);
  const builtInToolSelectorItems = BUILT_IN_SKILL_TOOL_ITEMS.map((item) => ({
    title: item.name,
    subTitle: item.description,
    value: item.id,
  }));
  const toolServerSelectorItems = OFFICIAL_TOOL_PRESET_SERVERS.map(
    (server) => ({
      title: server.name,
      subTitle: server.description,
      value: server.id,
    }),
  );

  const readonlyContextMarkdown = skill.context
    .map((message, index) => {
      const content = getMessageTextContent(message).trim();
      return `### ${index + 1}. ${message.role}\n\n${content || "_empty_"}`;
    })
    .join("\n\n");

  const updateConfig = (updater: (config: ModelConfig) => void) => {
    if (props.readonly) return;

    const config = { ...skill.modelConfig };
    updater(config);
    props.updateMask((mask) => {
      mask.modelConfig = config;
      // if user changed current session mask, it will disable auto sync
      mask.syncGlobalConfig = false;
    });
  };

  const updateRealtimeConfig = (updater: (config: RealtimeConfig) => void) => {
    if (props.readonly) return;

    const config = createDefaultRealtimeConfig(skill.realtimeConfig);
    updater(config);
    props.updateMask((mask) => {
      mask.realtimeConfig = config;
    });
  };

  const copySkillLink = () => {
    const skillLink = `${location.protocol}//${location.host}/#${Path.NewChat}?skill=${skill.id}`;
    copyToClipboard(skillLink);
  };

  const globalConfig = useAppConfig();

  return (
    <>
      {props.readonly ? (
        <List>
          <ListItem
            title={
              skill.lang === "cn" ? "技能包配置" : "Skill Package Configuration"
            }
            vertical
          >
            <SkillPackageSummary skill={skill} />
          </ListItem>
          {skill.category && (
            <ListItem title="Category" subTitle={skill.category} vertical />
          )}
          {skill.description && (
            <ListItem title="Description" vertical>
              <div className={styles["mask-readonly-section"]}>
                <Markdown content={skill.description} />
              </div>
            </ListItem>
          )}
          {!!skill.starters?.length && (
            <ListItem title="Recommended Starters" vertical>
              <div className={styles["mask-readonly-section"]}>
                <Markdown
                  content={skill.starters
                    .map((starter) => `- ${starter}`)
                    .join("\n")}
                />
              </div>
            </ListItem>
          )}
          <ListItem title="Preset Context" vertical>
            <div className={styles["mask-readonly-section"]}>
              <Markdown content={readonlyContextMarkdown} />
            </div>
          </ListItem>
        </List>
      ) : (
        <ContextPrompts
          context={skill.context}
          updateContext={(updater) => {
            const context = skill.context.slice();
            updater(context);
            props.updateMask((mask) => (mask.context = context));
          }}
        />
      )}

      <List>
        <ListItem title={Locale.Mask.Config.Avatar}>
          <Popover
            content={
              <AvatarPicker
                onEmojiClick={(emoji) => {
                  props.updateMask((mask) => (mask.avatar = emoji));
                  setShowPicker(false);
                }}
              ></AvatarPicker>
            }
            open={showPicker}
            onClose={() => setShowPicker(false)}
          >
            <div
              tabIndex={0}
              aria-label={Locale.Mask.Config.Avatar}
              onClick={() => setShowPicker(true)}
              style={{ cursor: "pointer" }}
            >
              <SkillAvatar
                avatar={skill.avatar}
                model={skill.modelConfig.model}
              />
            </div>
          </Popover>
        </ListItem>
        <ListItem title={Locale.Mask.Config.Name}>
          <input
            aria-label={Locale.Mask.Config.Name}
            type="text"
            value={skill.name}
            onInput={(e) =>
              props.updateMask((mask) => {
                mask.name = e.currentTarget.value;
              })
            }
          ></input>
        </ListItem>
        <ListItem
          title={Locale.Mask.Config.CandidateModels.Title}
          subTitle={Locale.Mask.Config.CandidateModels.SubTitle}
        >
          <input
            aria-label={Locale.Mask.Config.CandidateModels.Title}
            type="text"
            readOnly
            value={candidateModelSummary}
            onClick={() => setShowCandidateModelSelector(true)}
          ></input>
        </ListItem>
        <ListItem
          title={Locale.Mask.Config.Tools.BuiltIn.Title}
          subTitle={Locale.Mask.Config.Tools.BuiltIn.SubTitle}
        >
          <input
            aria-label={Locale.Mask.Config.Tools.BuiltIn.Title}
            type="text"
            readOnly
            value={builtInToolSummary}
            onClick={() => setShowBuiltInToolSelector(true)}
          ></input>
        </ListItem>
        <ListItem
          title={Locale.Mask.Config.Tools.ToolServers.Title}
          subTitle={Locale.Mask.Config.Tools.ToolServers.SubTitle}
        >
          <input
            aria-label={Locale.Mask.Config.Tools.ToolServers.Title}
            type="text"
            readOnly
            value={toolServerSummary}
            onClick={() => setShowToolServerSelector(true)}
          ></input>
        </ListItem>
        <ListItem
          title={Locale.Mask.Config.Tools.NativeToolBridge.Title}
          subTitle={Locale.Mask.Config.Tools.NativeToolBridge.SubTitle}
        >
          <input
            aria-label={Locale.Mask.Config.Tools.NativeToolBridge.Title}
            type="checkbox"
            checked={allowNativeToolBridge}
            onChange={(e) => {
              props.updateMask((mask) => {
                mask.toolStrategy = {
                  ...mask.toolStrategy,
                  nativeToolBridge: e.currentTarget.checked ? "auto" : "off",
                };
              });
            }}
          ></input>
        </ListItem>
        <ListItem
          title={Locale.Mask.Config.HideContext.Title}
          subTitle={Locale.Mask.Config.HideContext.SubTitle}
        >
          <input
            aria-label={Locale.Mask.Config.HideContext.Title}
            type="checkbox"
            checked={skill.hideContext}
            onChange={(e) => {
              props.updateMask((mask) => {
                mask.hideContext = e.currentTarget.checked;
              });
            }}
          ></input>
        </ListItem>

        {globalConfig.enableArtifacts && (
          <ListItem
            title={Locale.Mask.Config.Artifacts.Title}
            subTitle={Locale.Mask.Config.Artifacts.SubTitle}
          >
            <input
              aria-label={Locale.Mask.Config.Artifacts.Title}
              type="checkbox"
              checked={skill.enableArtifacts !== false}
              onChange={(e) => {
                props.updateMask((mask) => {
                  mask.enableArtifacts = e.currentTarget.checked;
                });
              }}
            ></input>
          </ListItem>
        )}
        {globalConfig.enableCodeFold && (
          <ListItem
            title={Locale.Mask.Config.CodeFold.Title}
            subTitle={Locale.Mask.Config.CodeFold.SubTitle}
          >
            <input
              aria-label={Locale.Mask.Config.CodeFold.Title}
              type="checkbox"
              checked={skill.enableCodeFold !== false}
              onChange={(e) => {
                props.updateMask((mask) => {
                  mask.enableCodeFold = e.currentTarget.checked;
                });
              }}
            ></input>
          </ListItem>
        )}

        {!props.shouldSyncFromGlobal ? (
          <ListItem
            title={Locale.Mask.Config.Share.Title}
            subTitle={Locale.Mask.Config.Share.SubTitle}
          >
            <IconButton
              aria={Locale.Mask.Config.Share.Title}
              icon={<CopyIcon />}
              text={Locale.Mask.Config.Share.Action}
              onClick={copySkillLink}
            />
          </ListItem>
        ) : null}

        {props.shouldSyncFromGlobal ? (
          <ListItem
            title={Locale.Mask.Config.Sync.Title}
            subTitle={Locale.Mask.Config.Sync.SubTitle}
          >
            <input
              aria-label={Locale.Mask.Config.Sync.Title}
              type="checkbox"
              checked={skill.syncGlobalConfig !== false}
              onChange={async (e) => {
                const checked = e.currentTarget.checked;
                if (
                  checked &&
                  (await showConfirm(Locale.Mask.Config.Sync.Confirm))
                ) {
                  props.updateMask((mask) => {
                    mask.syncGlobalConfig = checked;
                    mask.modelConfig = { ...globalConfig.modelConfig };
                  });
                } else if (!checked) {
                  props.updateMask((mask) => {
                    mask.syncGlobalConfig = checked;
                  });
                }
              }}
            ></input>
          </ListItem>
        ) : null}
      </List>

      <List>
        <ModelConfigList
          modelConfig={{ ...skill.modelConfig }}
          updateConfig={updateConfig}
          modelOptions={skillModelOptions}
          strictModelSelection
        />
        {props.extraListItems}
      </List>
      {isRealtimeSkill && (
        <List>
          <RealtimeConfigList
            realtimeConfig={createDefaultRealtimeConfig(skill.realtimeConfig)}
            updateConfig={updateRealtimeConfig}
          />
        </List>
      )}
      {showCandidateModelSelector && (
        <Selector
          multiple
          defaultSelectedValue={selectedCandidateValues}
          items={candidateModelSelectorItems}
          onClose={() => setShowCandidateModelSelector(false)}
          onSelection={(selection) => {
            const candidates = normalizeModelCandidates(
              selection.map((value) => {
                const [model, providerName] = getModelProvider(value);
                return {
                  model,
                  providerName,
                };
              }),
            );
            props.updateMask((mask) => {
              mask.candidateModels = candidates;
              mask.syncGlobalConfig = false;
            });
          }}
        />
      )}
      {showBuiltInToolSelector && (
        <Selector
          multiple
          defaultSelectedValue={selectedBuiltInTools}
          items={builtInToolSelectorItems}
          onClose={() => setShowBuiltInToolSelector(false)}
          onSelection={(selection) => {
            props.updateMask((mask) => {
              mask.tools = {
                ...mask.tools,
                builtInTools: selection,
              };
              syncSkillLegacyPlugin(mask);
            });
          }}
        />
      )}
      {showToolServerSelector && (
        <Selector
          multiple
          defaultSelectedValue={selectedToolServers}
          items={toolServerSelectorItems}
          onClose={() => setShowToolServerSelector(false)}
          onSelection={(selection) => {
            props.updateMask((mask) => {
              mask.tools = {
                ...mask.tools,
                toolServers: selection,
              };
              syncSkillLegacyPlugin(mask);
            });
          }}
        />
      )}
    </>
  );
}

export const MaskConfig = SkillConfig;

function ContextPromptItem(props: {
  index: number;
  prompt: ChatMessage;
  update: (prompt: ChatMessage) => void;
  remove: () => void;
}) {
  const [focusingInput, setFocusingInput] = useState(false);

  return (
    <div className={chatStyle["context-prompt-row"]}>
      {!focusingInput && (
        <>
          <div className={chatStyle["context-drag"]}>
            <DragIcon />
          </div>
          <Select
            value={props.prompt.role}
            className={chatStyle["context-role"]}
            onChange={(e) =>
              props.update({
                ...props.prompt,
                role: e.target.value as any,
              })
            }
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </>
      )}
      <Input
        value={getMessageTextContent(props.prompt)}
        type="text"
        className={chatStyle["context-content"]}
        rows={focusingInput ? 5 : 1}
        onFocus={() => setFocusingInput(true)}
        onBlur={() => {
          setFocusingInput(false);
          // If the selection is not removed when the user loses focus, some
          // extensions like "Translate" will always display a floating bar
          window?.getSelection()?.removeAllRanges();
        }}
        onInput={(e) =>
          props.update({
            ...props.prompt,
            content: e.currentTarget.value as any,
          })
        }
      />
      {!focusingInput && (
        <IconButton
          icon={<DeleteIcon />}
          className={chatStyle["context-delete-button"]}
          onClick={() => props.remove()}
          bordered
        />
      )}
    </div>
  );
}

export function ContextPrompts(props: {
  context: ChatMessage[];
  updateContext: (updater: (context: ChatMessage[]) => void) => void;
}) {
  const context = props.context;

  const addContextPrompt = (prompt: ChatMessage, i: number) => {
    props.updateContext((context) => context.splice(i, 0, prompt));
  };

  const removeContextPrompt = (i: number) => {
    props.updateContext((context) => context.splice(i, 1));
  };

  const updateContextPrompt = (i: number, prompt: ChatMessage) => {
    props.updateContext((context) => {
      const images = getMessageImages(context[i]);
      context[i] = prompt;
      if (images.length > 0) {
        const text = getMessageTextContent(context[i]);
        const newContext: MultimodalContent[] = [{ type: "text", text }];
        for (const img of images) {
          newContext.push({ type: "image_url", image_url: { url: img } });
        }
        context[i].content = newContext;
      }
    });
  };

  const onDragEnd: OnDragEndResponder = (result) => {
    if (!result.destination) {
      return;
    }
    const newContext = reorder(
      context,
      result.source.index,
      result.destination.index,
    );
    props.updateContext((context) => {
      context.splice(0, context.length, ...newContext);
    });
  };

  return (
    <>
      <div className={chatStyle["context-prompt"]} style={{ marginBottom: 20 }}>
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="context-prompt-list">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps}>
                {context.map((c, i) => (
                  <Draggable
                    draggableId={c.id || i.toString()}
                    index={i}
                    key={c.id}
                  >
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                      >
                        <ContextPromptItem
                          index={i}
                          prompt={c}
                          update={(prompt) => updateContextPrompt(i, prompt)}
                          remove={() => removeContextPrompt(i)}
                        />
                        <div
                          className={chatStyle["context-prompt-insert"]}
                          onClick={() => {
                            addContextPrompt(
                              createMessage({
                                role: "user",
                                content: "",
                                date: new Date().toLocaleString(),
                              }),
                              i + 1,
                            );
                          }}
                        >
                          <AddIcon />
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        {props.context.length === 0 && (
          <div className={chatStyle["context-prompt-row"]}>
            <IconButton
              icon={<AddIcon />}
              text={Locale.Context.Add}
              bordered
              className={chatStyle["context-prompt-button"]}
              onClick={() =>
                addContextPrompt(
                  createMessage({
                    role: "user",
                    content: "",
                    date: "",
                  }),
                  props.context.length,
                )
              }
            />
          </div>
        )}
      </div>
    </>
  );
}

export function SkillPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const skillStore = useSkillStore();
  const chatStore = useChatStore();
  const sdStore = useSdStore();

  const filterLang = skillStore.language;

  const allSkills = getLaunchableSkills(skillStore.getAll()).filter(
    (m) => !filterLang || m.lang === filterLang,
  );

  const [searchText, setSearchText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const categories = useMemo(
    () =>
      Array.from(
        new Set(allSkills.map((m) => m.category).filter(Boolean) as string[]),
      ),
    [allSkills],
  );
  useEffect(() => {
    if (selectedCategory && !categories.includes(selectedCategory)) {
      setSelectedCategory("");
    }
  }, [categories, selectedCategory]);
  const skills = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return allSkills.filter((m) => {
      const matchCategory =
        !selectedCategory || m.category === selectedCategory;
      const haystack = [
        m.name,
        m.category,
        m.description,
        ...(m.starters ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return matchCategory && (!keyword || haystack.includes(keyword));
    });
  }, [allSkills, searchText, selectedCategory]);

  const [editingSkillId, setEditingSkillId] = useState<string | undefined>();
  const editingSkill =
    skillStore.get(editingSkillId) ?? BUILTIN_SKILL_STORE.get(editingSkillId);
  const closeSkillModal = () => {
    setEditingSkillId(undefined);
    if (new URLSearchParams(location.search).has("skill")) {
      navigate(Path.Skills, { replace: true });
    }
  };

  const startSkill = (skill: Skill) => {
    if (skill.launch?.type === "sd") {
      sdStore.startBlankCreation();
      navigate(Path.Sd);
      return;
    }

    if (chatStore.newSession(skill) !== false) {
      navigate(Path.Chat);
    }
  };

  useEffect(() => {
    const skillId = new URLSearchParams(location.search).get("skill");
    if (!skillId) return;
    const matchedSkill = allSkills.find(
      (skill) => String(skill.id) === skillId,
    );
    if (matchedSkill) {
      setEditingSkillId(String(matchedSkill.id));
    }
  }, [allSkills, location.search]);

  const downloadAll = () => {
    downloadAs(
      JSON.stringify(skills.filter((v) => !v.builtin)),
      FileName.Skills,
    );
  };

  const importFromFile = () => {
    readFromFile().then((content) => {
      try {
        const importMasks = JSON.parse(content);
        if (Array.isArray(importMasks)) {
          for (const skill of importMasks) {
            if (skill.name) {
              skillStore.create(skill);
            }
          }
          return;
        }
        // If the file contains a single skill, import it directly.
        if (importMasks.name) {
          skillStore.create(importMasks);
        }
      } catch {}
    });
  };

  return (
    <ErrorBoundary>
      <div className={styles["mask-page"]}>
        <div className="window-header">
          <div className="window-header-title">
            <div className="window-header-main-title">
              {Locale.Mask.Page.Title}
            </div>
            <div className="window-header-submai-title">
              {Locale.Mask.Page.SubTitle(allSkills.length)}
            </div>
          </div>

          <div className="window-actions">
            <div className="window-action-button">
              <IconButton
                icon={<DownloadIcon />}
                bordered
                onClick={downloadAll}
                text={Locale.UI.Export}
              />
            </div>
            <div className="window-action-button">
              <IconButton
                icon={<UploadIcon />}
                text={Locale.UI.Import}
                bordered
                onClick={() => importFromFile()}
              />
            </div>
            <div className="window-action-button">
              <IconButton
                icon={<CloseIcon />}
                bordered
                onClick={() => navigate(-1)}
              />
            </div>
          </div>
        </div>

        <div className={styles["mask-page-body"]}>
          <div className={styles["mask-filter"]}>
            <input
              type="text"
              className={styles["search-bar"]}
              placeholder={Locale.Mask.Page.Search}
              autoFocus
              onInput={(e) => setSearchText(e.currentTarget.value)}
            />
            <Select
              className={styles["mask-filter-lang"]}
              value={filterLang ?? Locale.Settings.Lang.All}
              onChange={(e) => {
                const value = e.currentTarget.value;
                if (value === Locale.Settings.Lang.All) {
                  skillStore.setLanguage(undefined);
                } else {
                  skillStore.setLanguage(value as Lang);
                }
              }}
            >
              <option key="all" value={Locale.Settings.Lang.All}>
                {Locale.Settings.Lang.All}
              </option>
              {AllLangs.map((lang) => (
                <option value={lang} key={lang}>
                  {ALL_LANG_OPTIONS[lang]}
                </option>
              ))}
            </Select>

            <IconButton
              className={styles["mask-create"]}
              icon={<AddIcon />}
              text={Locale.Mask.Page.Create}
              bordered
              onClick={() => {
                const createdSkill = skillStore.create();
                setEditingSkillId(createdSkill.id);
              }}
            />
          </div>

          {categories.length > 0 && (
            <div className={styles["mask-categories"]}>
              <button
                className={clsx(
                  styles["mask-category-filter"],
                  !selectedCategory && styles["mask-category-filter-active"],
                )}
                onClick={() => setSelectedCategory("")}
              >
                {Locale.Mask.Page.AllCategories}
              </button>
              {categories.map((category) => (
                <button
                  key={category}
                  className={clsx(
                    styles["mask-category-filter"],
                    selectedCategory === category &&
                      styles["mask-category-filter-active"],
                  )}
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>
          )}

          <div className={styles["mask-grid"]}>
            {skills.map((m) => (
              <div className={styles["mask-item"]} key={m.id}>
                <div className={styles["mask-header"]}>
                  <div className={styles["mask-icon"]}>
                    <SkillAvatar
                      avatar={m.avatar}
                      model={m.modelConfig.model}
                    />
                  </div>
                  <div className={styles["mask-title"]}>
                    <div className={styles["mask-name"]}>{m.name}</div>
                    {m.category && (
                      <div className={styles["mask-category"]}>
                        {m.category}
                      </div>
                    )}
                    {m.description && (
                      <div className={styles["mask-description"]}>
                        {m.description}
                      </div>
                    )}
                    <div className={clsx(styles["mask-info"], "one-line")}>
                      {`${Locale.Mask.Item.Info(m.context.length)} / ${
                        ALL_LANG_OPTIONS[m.lang]
                      } / ${m.modelConfig.model}`}
                    </div>
                    {!!m.starters?.length && (
                      <div className={styles["mask-starters"]}>
                        {m.starters.slice(0, 2).map((starter) => (
                          <div key={starter} className={styles["mask-starter"]}>
                            {starter}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className={styles["mask-actions"]}>
                  <IconButton
                    icon={<AddIcon />}
                    text={Locale.Mask.Item.Chat}
                    onClick={() => startSkill(m)}
                  />
                  {m.builtin ? (
                    <IconButton
                      icon={<EyeIcon />}
                      text={Locale.Mask.Item.View}
                      onClick={() => setEditingSkillId(m.id)}
                    />
                  ) : (
                    <IconButton
                      icon={<EditIcon />}
                      text={Locale.Mask.Item.Edit}
                      onClick={() => setEditingSkillId(m.id)}
                    />
                  )}
                  {!m.builtin && (
                    <IconButton
                      icon={<DeleteIcon />}
                      text={Locale.Mask.Item.Delete}
                      onClick={async () => {
                        if (await showConfirm(Locale.Mask.Item.DeleteConfirm)) {
                          skillStore.delete(m.id);
                        }
                      }}
                    />
                  )}
                </div>
              </div>
            ))}
            {skills.length === 0 && (
              <div className={styles["mask-empty"]}>
                {Locale.Mask.Page.Empty}
              </div>
            )}
          </div>
        </div>
      </div>

      {editingSkill && (
        <div className="modal-mask">
          <Modal
            title={Locale.Mask.EditModal.Title(editingSkill?.builtin)}
            onClose={closeSkillModal}
            actions={[
              <IconButton
                icon={<DownloadIcon />}
                text={Locale.Mask.EditModal.Download}
                key="export"
                bordered
                onClick={() =>
                  downloadAs(
                    JSON.stringify(editingSkill),
                    `${editingSkill.name}.json`,
                  )
                }
              />,
              <IconButton
                key="copy"
                icon={<CopyIcon />}
                bordered
                text={Locale.Mask.EditModal.Clone}
                onClick={() => {
                  navigate(Path.Skills);
                  skillStore.create(editingSkill);
                  setEditingSkillId(undefined);
                }}
              />,
            ]}
          >
            <SkillConfig
              mask={editingSkill}
              updateMask={(updater) =>
                skillStore.updateMask(editingSkillId!, updater)
              }
              readonly={editingSkill.builtin}
            />
          </Modal>
        </div>
      )}
    </ErrorBoundary>
  );
}

export const MaskPage = SkillPage;
