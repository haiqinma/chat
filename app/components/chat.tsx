import { useDebouncedCallback } from "use-debounce";
import React, {
  Fragment,
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import SendWhiteIcon from "../icons/send-white.svg";
import BrainIcon from "../icons/brain.svg";
import RenameIcon from "../icons/rename.svg";
import EditIcon from "../icons/rename.svg";
import ExportIcon from "../icons/share.svg";
import HistoryIcon from "../icons/history.svg";
import CopyIcon from "../icons/copy.svg";
import SpeakIcon from "../icons/speak.svg";
import SpeakStopIcon from "../icons/speak-stop.svg";
import LoadingIcon from "../icons/three-dots.svg";
import LoadingButtonIcon from "../icons/loading.svg";
import PromptIcon from "../icons/prompt.svg";
import MaskIcon from "../icons/mask.svg";
import MaxIcon from "../icons/max.svg";
import MinIcon from "../icons/min.svg";
import ResetIcon from "../icons/reload.svg";
import ReloadIcon from "../icons/reload.svg";
import BreakIcon from "../icons/break.svg";
import SettingsIcon from "../icons/chat-settings.svg";
import DeleteIcon from "../icons/clear.svg";
import PinIcon from "../icons/pin.svg";
import ConfirmIcon from "../icons/confirm.svg";
import CloseIcon from "../icons/close.svg";
import CancelIcon from "../icons/cancel.svg";
import ImageIcon from "../icons/image.svg";

import LightIcon from "../icons/light.svg";
import DarkIcon from "../icons/dark.svg";
import AutoIcon from "../icons/auto.svg";
import BottomIcon from "../icons/bottom.svg";
import StopIcon from "../icons/pause.svg";
import RobotIcon from "../icons/robot.svg";
import SizeIcon from "../icons/size.svg";
import QualityIcon from "../icons/hd.svg";
import StyleIcon from "../icons/palette.svg";
import PluginIcon from "../icons/plugin.svg";
import ShortcutkeyIcon from "../icons/shortcutkey.svg";
import ToolIcon from "../icons/tool.svg";
import HeadphoneIcon from "../icons/headphone.svg";
import {
  BOT_HELLO,
  ChatMessage,
  createMessage,
  DEFAULT_TOPIC,
  ModelType,
  SubmitKey,
  Theme,
  useAccessStore,
  useAppConfig,
  useChatStore,
  usePluginStore,
} from "../store";

import {
  autoGrowTextArea,
  copyToClipboard,
  getMessageAttachments,
  getMessageContentLength,
  getMessageImages,
  getMessageTextContent,
  isDalle3,
  isGptImageModel,
  isVisionCapableModel,
  safeLocalStorage,
  getModelSizes,
  supportsCustomSize,
  useMobileScreen,
  selectOrCopy,
  showPlugins,
} from "../utils";

import { uploadAttachmentForChat } from "@/app/utils/chat";
import { useAuth } from "../hooks/useAuth";
import { getCurrentAccount } from "../plugins/wallet";

import dynamic from "next/dynamic";

import { ChatControllerPool } from "../client/controller";
import {
  DalleQuality,
  DalleStyle,
  GptImageQuality,
  ImageQuality,
  ModelSize,
} from "../typing";
import { Prompt, usePromptStore } from "../store/prompt";
import Locale from "../locales";

import { IconButton } from "./button";
import styles from "./chat.module.scss";

import {
  List,
  ListItem,
  Modal,
  Selector,
  showConfirm,
  showImageModal,
  showPrompt,
  showToast,
} from "./ui-lib";
import { useNavigate } from "react-router-dom";
import {
  AUTO_SUBMIT_INPUT,
  CHAT_PAGE_SIZE,
  DEFAULT_TTS_ENGINE,
  ModelProvider,
  Path,
  REQUEST_TIMEOUT_MS,
  ServiceProvider,
  UNFINISHED_INPUT,
} from "../constant";
import { Avatar } from "./emoji";
import { ContextPrompts, SkillAvatar, SkillConfig } from "./skill-editor";
import { getSkillSessionToolbar, syncSkillLegacyPlugin } from "../store/skill";
import { ChatCommandPrefix, useChatCommand, useCommand } from "../command";
import { prettyObject } from "../utils/format";
import { ExportMessageModal } from "./exporter";
import { getClientConfig } from "../config/client";
import { useRouterTokenStatus, useSessionModels } from "../utils/hooks";
import {
  ClientApi,
  MultimodalContent,
  normalizeSupportedEndpoints,
  selectPreferredRequestEndpoint,
  supportsTextEndpoint,
} from "../client/api";
import { createTTSPlayer } from "../utils/audio";
import { MsEdgeTTS, OUTPUT_FORMAT } from "../utils/ms_edge_tts";

import { isEmpty } from "lodash-es";
import {
  getModelProvider,
  matchesModelCandidate,
  normalizeModelCandidates,
  normalizeProviderName,
} from "../utils/model";
import {
  disablePlainChatReasoning,
  isPlainChatLikeSkill,
} from "../utils/plain-chat";
import { RealtimeChat } from "@/app/components/realtime-chat";
import clsx from "clsx";
import {
  getAvailableClientsCount,
  isToolRuntimeEnabled,
} from "../tools/actions";

const localStorage = safeLocalStorage();

const ttsPlayer = createTTSPlayer();

const Markdown = dynamic(async () => (await import("./markdown")).Markdown, {
  loading: () => <LoadingIcon />,
});

const ROUTER_TOKEN_REQUIRED_ERROR = "请先在 Router 页面选择可用令牌";

const ToolAction = () => {
  const navigate = useNavigate();
  const [count, setCount] = useState<number>(0);
  const [toolEnabled, setToolEnabled] = useState(false);

  useEffect(() => {
    const checkToolStatus = async () => {
      const enabled = await isToolRuntimeEnabled();
      setToolEnabled(enabled);
      if (enabled) {
        const count = await getAvailableClientsCount();
        setCount(count);
      }
    };
    checkToolStatus();
  }, []);

  if (!toolEnabled) return null;

  return (
    <ChatAction
      onClick={() => navigate(`${Path.Discovery}?type=tool`)}
      text={`${Locale.Tool.Name}${count ? ` (${count})` : ""}`}
      icon={<ToolIcon />}
    />
  );
};

export function SessionConfigModel(props: { onClose: () => void }) {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const sessionSkill = session.skill;
  const runtimeModels = useSessionModels();

  return (
    <div className="modal-mask">
      <Modal
        title={Locale.Context.Edit}
        onClose={() => props.onClose()}
        actions={[
          <IconButton
            key="reset"
            icon={<ResetIcon />}
            bordered
            text={Locale.Chat.Config.Reset}
            onClick={async () => {
              if (await showConfirm(Locale.Memory.ResetConfirm)) {
                chatStore.updateTargetSession(
                  session,
                  (session) => (session.memoryPrompt = ""),
                );
              }
            }}
          />,
        ]}
      >
        <SkillConfig
          skill={sessionSkill}
          updateSkill={(updater) => {
            const nextSkill = { ...sessionSkill };
            updater(nextSkill);
            chatStore.updateTargetSession(
              session,
              (session) => (session.skill = nextSkill),
            );
          }}
          modelOptions={runtimeModels}
          shouldSyncFromGlobal
          extraListItems={
            sessionSkill.modelConfig.sendMemory ? (
              <ListItem
                className="copyable"
                title={`${Locale.Memory.Title} (${session.lastSummarizeIndex} of ${session.messages.length})`}
                subTitle={session.memoryPrompt || Locale.Memory.EmptyContent}
              ></ListItem>
            ) : (
              <></>
            )
          }
        ></SkillConfig>
      </Modal>
    </div>
  );
}

function PromptToast(props: {
  showToast?: boolean;
  showModal?: boolean;
  setShowModal: (_: boolean) => void;
}) {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const sessionSkill = session.skill;
  const context = sessionSkill.context;

  return (
    <div className={styles["prompt-toast"]} key="prompt-toast">
      {props.showToast && context.length > 0 && (
        <div
          className={clsx(styles["prompt-toast-inner"], "clickable")}
          role="button"
          onClick={() => props.setShowModal(true)}
        >
          <BrainIcon />
          <span className={styles["prompt-toast-content"]}>
            {Locale.Context.Toast(context.length)}
          </span>
        </div>
      )}
      {props.showModal && (
        <SessionConfigModel onClose={() => props.setShowModal(false)} />
      )}
    </div>
  );
}

function useSubmitHandler() {
  const config = useAppConfig();
  const submitKey = config.submitKey;
  const isComposing = useRef(false);

  useEffect(() => {
    const onCompositionStart = () => {
      isComposing.current = true;
    };
    const onCompositionEnd = () => {
      isComposing.current = false;
    };

    window.addEventListener("compositionstart", onCompositionStart);
    window.addEventListener("compositionend", onCompositionEnd);

    return () => {
      window.removeEventListener("compositionstart", onCompositionStart);
      window.removeEventListener("compositionend", onCompositionEnd);
    };
  }, []);

  const shouldSubmit = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Fix Chinese input method "Enter" on Safari
    if (e.keyCode == 229) return false;
    if (e.key !== "Enter") return false;
    if (e.key === "Enter" && (e.nativeEvent.isComposing || isComposing.current))
      return false;
    return (
      (config.submitKey === SubmitKey.AltEnter && e.altKey) ||
      (config.submitKey === SubmitKey.CtrlEnter && e.ctrlKey) ||
      (config.submitKey === SubmitKey.ShiftEnter && e.shiftKey) ||
      (config.submitKey === SubmitKey.MetaEnter && e.metaKey) ||
      (config.submitKey === SubmitKey.Enter &&
        !e.altKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        !e.metaKey)
    );
  };

  return {
    submitKey,
    shouldSubmit,
  };
}

export type RenderPrompt = Pick<Prompt, "title" | "content">;

export function PromptHints(props: {
  prompts: RenderPrompt[];
  onPromptSelect: (prompt: RenderPrompt) => void;
}) {
  const noPrompts = props.prompts.length === 0;
  const [selectIndex, setSelectIndex] = useState(0);
  const selectedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectIndex(0);
  }, [props.prompts.length]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (noPrompts || e.metaKey || e.altKey || e.ctrlKey) {
        return;
      }
      // arrow up / down to select prompt
      const changeIndex = (delta: number) => {
        e.stopPropagation();
        e.preventDefault();
        const nextIndex = Math.max(
          0,
          Math.min(props.prompts.length - 1, selectIndex + delta),
        );
        setSelectIndex(nextIndex);
        selectedRef.current?.scrollIntoView({
          block: "center",
        });
      };

      if (e.key === "ArrowUp") {
        changeIndex(1);
      } else if (e.key === "ArrowDown") {
        changeIndex(-1);
      } else if (e.key === "Enter") {
        const selectedPrompt = props.prompts.at(selectIndex);
        if (selectedPrompt) {
          props.onPromptSelect(selectedPrompt);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.prompts.length, selectIndex]);

  if (noPrompts) return null;
  return (
    <div className={styles["prompt-hints"]}>
      {props.prompts.map((prompt, i) => (
        <div
          ref={i === selectIndex ? selectedRef : null}
          className={clsx(styles["prompt-hint"], {
            [styles["prompt-hint-selected"]]: i === selectIndex,
          })}
          key={prompt.title + i.toString()}
          onClick={() => props.onPromptSelect(prompt)}
          onMouseEnter={() => setSelectIndex(i)}
        >
          <div className={styles["hint-title"]}>{prompt.title}</div>
          <div className={styles["hint-content"]}>{prompt.content}</div>
        </div>
      ))}
    </div>
  );
}

function ClearContextDivider() {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();

  return (
    <div
      className={styles["clear-context"]}
      onClick={() =>
        chatStore.updateTargetSession(
          session,
          (session) => (session.clearContextIndex = undefined),
        )
      }
    >
      <div className={styles["clear-context-tips"]}>{Locale.Context.Clear}</div>
      <div className={styles["clear-context-revert-btn"]}>
        {Locale.Context.Revert}
      </div>
    </div>
  );
}

export function ChatAction(props: {
  text: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  const iconRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState({
    full: 16,
    icon: 16,
  });

  function updateWidth() {
    if (!iconRef.current || !textRef.current) return;
    const getWidth = (dom: HTMLDivElement) => dom.getBoundingClientRect().width;
    const textWidth = getWidth(textRef.current);
    const iconWidth = getWidth(iconRef.current);
    setWidth({
      full: textWidth + iconWidth,
      icon: iconWidth,
    });
  }

  return (
    <div
      className={clsx(styles["chat-input-action"], "clickable")}
      onClick={() => {
        props.onClick();
        setTimeout(updateWidth, 1);
      }}
      onMouseEnter={updateWidth}
      onTouchStart={updateWidth}
      style={
        {
          "--icon-width": `${width.icon}px`,
          "--full-width": `${width.full}px`,
        } as React.CSSProperties
      }
    >
      <div ref={iconRef} className={styles["icon"]}>
        {props.icon}
      </div>
      <div className={styles["text"]} ref={textRef}>
        {props.text}
      </div>
    </div>
  );
}

function useScrollToBottom(
  scrollRef: RefObject<HTMLDivElement | null>,
  detach: boolean = false,
  messages: ChatMessage[],
) {
  // for auto-scroll
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollDomToBottom = useCallback(() => {
    const dom = scrollRef.current;
    if (dom) {
      requestAnimationFrame(() => {
        setAutoScroll(true);
        dom.scrollTo(0, dom.scrollHeight);
      });
    }
  }, [scrollRef]);

  // auto scroll
  useEffect(() => {
    if (autoScroll && !detach) {
      scrollDomToBottom();
    }
  });

  // auto scroll when messages length changes
  const lastMessagesLength = useRef(messages.length);
  useEffect(() => {
    if (messages.length > lastMessagesLength.current && !detach) {
      scrollDomToBottom();
    }
    lastMessagesLength.current = messages.length;
  }, [messages.length, detach, scrollDomToBottom]);

  return {
    scrollRef,
    autoScroll,
    setAutoScroll,
    scrollDomToBottom,
  };
}

export function ChatActions(props: {
  uploadImage: () => void;
  setAttachContents: (content: MultimodalContent[]) => void;
  setUploading: (uploading: boolean) => void;
  showPromptModal: () => void;
  scrollToBottom: () => void;
  showPromptHints: () => void;
  hitBottom: boolean;
  uploading: boolean;
  setShowShortcutKeyModal: React.Dispatch<React.SetStateAction<boolean>>;
  setUserInput: (input: string) => void;
  setShowChatSidePanel: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const config = useAppConfig();
  const navigate = useNavigate();
  const chatStore = useChatStore();
  const pluginStore = usePluginStore();
  const session = chatStore.currentSession();
  const sessionSkill = session.skill;
  const toolbar = getSkillSessionToolbar(sessionSkill);
  const { setAttachContents, setUploading } = props;

  // switch themes
  const theme = config.theme;

  function nextTheme() {
    const themes = [Theme.Auto, Theme.Light, Theme.Dark];
    const themeIndex = themes.indexOf(theme);
    const nextIndex = (themeIndex + 1) % themes.length;
    const nextTheme = themes[nextIndex];
    config.update((config) => (config.theme = nextTheme));
  }

  // stop all responses
  const couldStop = ChatControllerPool.hasPending();
  const stopAll = () => ChatControllerPool.stopAll();

  // switch model
  const currentModel = sessionSkill.modelConfig.model;
  const currentProviderName = (normalizeProviderName(
    sessionSkill.modelConfig?.providerName,
  ) ??
    sessionSkill.modelConfig?.providerName ??
    ServiceProvider.OpenAI) as ServiceProvider;
  const sessionCandidateModels = useMemo(
    () => normalizeModelCandidates(sessionSkill.candidateModels),
    [sessionSkill.candidateModels],
  );
  const allAvailableModels = useSessionModels();
  const sessionModels = useSessionModels(sessionCandidateModels);
  const hasCandidateModelRestriction = sessionCandidateModels.length > 0;
  const textAvailableModels = useMemo(
    () =>
      allAvailableModels.filter((model) => {
        const tags = Array.isArray(model.tags) ? model.tags : [];
        if (tags.length > 0) return tags.includes("text");
        const endpoints = model.supportedEndpoints ?? [];
        if (endpoints.length > 0) return supportsTextEndpoint(endpoints);
        return true;
      }),
    [allAvailableModels],
  );
  const selectableSessionModels = hasCandidateModelRestriction
    ? sessionModels
    : textAvailableModels;
  const models = useMemo(() => {
    const defaultModel = selectableSessionModels.find((m) => m.isDefault);

    if (defaultModel) {
      const arr = [
        defaultModel,
        ...selectableSessionModels.filter((m) => m !== defaultModel),
      ];
      return arr;
    } else {
      return selectableSessionModels;
    }
  }, [selectableSessionModels]);
  const currentRuntimeModel = useMemo(
    () =>
      models.find(
        (m) =>
          m.name === currentModel &&
          m.provider?.providerName === currentProviderName,
      ),
    [currentModel, currentProviderName, models],
  );
  const currentModelTags =
    sessionSkill.modelConfig.tags ?? currentRuntimeModel?.tags;
  const currentModelName = useMemo(() => {
    if (models.length === 0) {
      return hasCandidateModelRestriction
        ? currentModel
        : Locale.SearchChat.Page.Loading;
    }
    const model = models.find(
      (m) =>
        m.name == currentModel &&
        m?.provider?.providerName == currentProviderName,
    );
    return model?.displayName ?? currentModel;
  }, [hasCandidateModelRestriction, models, currentModel, currentProviderName]);
  const modelSelectorItems = useMemo(() => {
    if (models.length === 0) {
      return [
        {
          title: hasCandidateModelRestriction
            ? "No available models"
            : Locale.SearchChat.Page.Loading,
          value: "loading",
          disable: true,
        },
      ];
    }
    return models.map((m) => ({
      title: `${m.displayName}${
        m?.provider?.providerName ? " (" + m?.provider?.providerName + ")" : ""
      }`,
      value: `${m.name}@${m?.provider?.providerName}`,
    }));
  }, [hasCandidateModelRestriction, models]);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showPluginSelector, setShowPluginSelector] = useState(false);
  const [showUploadImage, setShowUploadImage] = useState(false);

  const [showSizeSelector, setShowSizeSelector] = useState(false);
  const [showQualitySelector, setShowQualitySelector] = useState(false);
  const [showStyleSelector, setShowStyleSelector] = useState(false);
  const modelSizes = getModelSizes(currentModel);
  const dalle3Qualitys: DalleQuality[] = ["standard", "hd"];
  const gptImageQualitys: GptImageQuality[] = ["auto", "high", "medium", "low"];
  const dalle3Styles: DalleStyle[] = ["vivid", "natural"];
  const currentSize =
    sessionSkill.modelConfig?.size ?? ("1024x1024" as ModelSize);
  const qualityOptions: ImageQuality[] = isDalle3(currentModel)
    ? dalle3Qualitys
    : isGptImageModel(currentModel)
      ? gptImageQualitys
      : [];
  const defaultQuality: ImageQuality = isDalle3(currentModel)
    ? "standard"
    : "auto";
  const storedQuality = sessionSkill.modelConfig?.quality as
    | ImageQuality
    | undefined;
  const currentQuality =
    storedQuality && qualityOptions.includes(storedQuality)
      ? storedQuality
      : defaultQuality;
  const currentStyle = sessionSkill.modelConfig?.style ?? "vivid";

  const isMobileScreen = useMobileScreen();

  useEffect(() => {
    const show =
      toolbar.imageUpload &&
      isVisionCapableModel({ model: currentModel, tags: currentModelTags });
    setShowUploadImage(show);
    if (!show) {
      setAttachContents([]);
      setUploading(false);
    }

    // if current model is not available
    // switch to first available model
    const isUnavailableModel = !models.some(
      (m) =>
        m.name === currentModel &&
        m.provider?.providerName === currentProviderName,
    );
    if (isUnavailableModel && models.length > 0) {
      // show next model to default model if exist
      let nextModel = models.find((model) => model.isDefault) || models[0];
      chatStore.updateTargetSession(session, (session) => {
        const sessionSkill = session.skill;
        const supportedEndpoints = normalizeSupportedEndpoints(
          nextModel.supportedEndpoints,
        );
        sessionSkill.modelConfig.model = nextModel.name;
        sessionSkill.modelConfig.providerName = nextModel?.provider
          ?.providerName as ServiceProvider;
        sessionSkill.modelConfig.supportedEndpoints = supportedEndpoints;
        sessionSkill.modelConfig.endpointPath = selectPreferredRequestEndpoint(
          supportedEndpoints,
          {
            modelName: nextModel.name,
          },
        );
        sessionSkill.modelConfig.ownedBy = nextModel.ownedBy;
        sessionSkill.modelConfig.tags = nextModel.tags;
      });
      showToast(
        nextModel?.provider?.providerName == ServiceProvider.Volcengine
          ? (nextModel.displayName ?? nextModel.name)
          : nextModel.name,
      );
    }
  }, [
    chatStore,
    currentProviderName,
    currentModel,
    currentModelTags,
    models,
    session,
    setAttachContents,
    setUploading,
    toolbar.imageUpload,
  ]);

  return (
    <div className={styles["chat-input-actions"]}>
      <>
        {couldStop && (
          <ChatAction
            onClick={stopAll}
            text={Locale.Chat.InputActions.Stop}
            icon={<StopIcon />}
          />
        )}
        {!props.hitBottom && (
          <ChatAction
            onClick={props.scrollToBottom}
            text={Locale.Chat.InputActions.ToBottom}
            icon={<BottomIcon />}
          />
        )}
        {props.hitBottom && toolbar.settings && (
          <ChatAction
            onClick={props.showPromptModal}
            text={Locale.Chat.InputActions.Settings}
            icon={<SettingsIcon />}
          />
        )}

        {toolbar.imageUpload && showUploadImage && (
          <ChatAction
            onClick={props.uploadImage}
            text={Locale.Chat.InputActions.UploadImage}
            icon={props.uploading ? <LoadingButtonIcon /> : <ImageIcon />}
          />
        )}
        {toolbar.theme && (
          <ChatAction
            onClick={nextTheme}
            text={Locale.Chat.InputActions.Theme[theme]}
            icon={
              <>
                {theme === Theme.Auto ? (
                  <AutoIcon />
                ) : theme === Theme.Light ? (
                  <LightIcon />
                ) : theme === Theme.Dark ? (
                  <DarkIcon />
                ) : null}
              </>
            }
          />
        )}

        {toolbar.promptHints && (
          <ChatAction
            onClick={props.showPromptHints}
            text={Locale.Chat.InputActions.Prompt}
            icon={<PromptIcon />}
          />
        )}

        {toolbar.skillSwitcher && (
          <ChatAction
            onClick={() => {
              navigate(Path.Skills);
            }}
            text={Locale.Chat.InputActions.Masks}
            icon={<MaskIcon />}
          />
        )}

        {toolbar.clearContext && (
          <ChatAction
            text={Locale.Chat.InputActions.Clear}
            icon={<BreakIcon />}
            onClick={() => {
              chatStore.updateTargetSession(session, (session) => {
                if (session.clearContextIndex === session.messages.length) {
                  session.clearContextIndex = undefined;
                } else {
                  session.clearContextIndex = session.messages.length;
                  session.memoryPrompt = ""; // will clear memory
                }
              });
            }}
          />
        )}

        {toolbar.modelSelector && (
          <ChatAction
            onClick={() => setShowModelSelector(true)}
            text={currentModelName}
            icon={<RobotIcon />}
          />
        )}

        {toolbar.modelSelector && showModelSelector && (
          <Selector
            defaultSelectedValue={`${currentModel}@${currentProviderName}`}
            items={modelSelectorItems}
            onClose={() => setShowModelSelector(false)}
            onSelection={(s) => {
              if (s.length === 0) return;
              const [model, providerName] = getModelProvider(s[0]);
              const selectedModel = models.find(
                (m) =>
                  m.name == model && m?.provider?.providerName == providerName,
              );
              chatStore.updateTargetSession(session, (session) => {
                const sessionSkill = session.skill;
                const supportedEndpoints = normalizeSupportedEndpoints(
                  selectedModel?.supportedEndpoints,
                );
                sessionSkill.modelConfig.model = model as ModelType;
                sessionSkill.modelConfig.providerName =
                  providerName as ServiceProvider;
                sessionSkill.modelConfig.supportedEndpoints =
                  supportedEndpoints;
                sessionSkill.modelConfig.endpointPath =
                  selectPreferredRequestEndpoint(supportedEndpoints, {
                    modelName: model,
                  });
                sessionSkill.modelConfig.ownedBy = selectedModel?.ownedBy;
                sessionSkill.modelConfig.tags = selectedModel?.tags;
                sessionSkill.modelConfig.quality = isGptImageModel(model)
                  ? "auto"
                  : isDalle3(model)
                    ? "standard"
                    : sessionSkill.modelConfig.quality;
                sessionSkill.syncGlobalConfig = false;
              });
              if (providerName == ServiceProvider.Volcengine) {
                showToast(selectedModel?.displayName ?? "");
              } else {
                showToast(model);
              }
            }}
          />
        )}

        {toolbar.imageParams && supportsCustomSize(currentModel) && (
          <ChatAction
            onClick={() => setShowSizeSelector(true)}
            text={currentSize}
            icon={<SizeIcon />}
          />
        )}

        {showSizeSelector && (
          <Selector
            defaultSelectedValue={currentSize}
            items={modelSizes.map((m) => ({
              title: m,
              value: m,
            }))}
            onClose={() => setShowSizeSelector(false)}
            onSelection={(s) => {
              if (s.length === 0) return;
              const size = s[0];
              chatStore.updateTargetSession(session, (session) => {
                const sessionSkill = session.skill;
                sessionSkill.modelConfig.size = size;
              });
              showToast(size);
            }}
          />
        )}

        {toolbar.imageParams && qualityOptions.length > 0 && (
          <ChatAction
            onClick={() => setShowQualitySelector(true)}
            text={currentQuality}
            icon={<QualityIcon />}
          />
        )}

        {showQualitySelector && (
          <Selector
            defaultSelectedValue={currentQuality}
            items={qualityOptions.map((m) => ({
              title: m,
              value: m,
            }))}
            onClose={() => setShowQualitySelector(false)}
            onSelection={(q) => {
              if (q.length === 0) return;
              const quality = q[0] as ImageQuality;
              chatStore.updateTargetSession(session, (session) => {
                const sessionSkill = session.skill;
                sessionSkill.modelConfig.quality = quality;
              });
              showToast(quality);
            }}
          />
        )}

        {toolbar.imageParams && isDalle3(currentModel) && (
          <ChatAction
            onClick={() => setShowStyleSelector(true)}
            text={currentStyle}
            icon={<StyleIcon />}
          />
        )}

        {showStyleSelector && (
          <Selector
            defaultSelectedValue={currentStyle}
            items={dalle3Styles.map((m) => ({
              title: m,
              value: m,
            }))}
            onClose={() => setShowStyleSelector(false)}
            onSelection={(s) => {
              if (s.length === 0) return;
              const style = s[0];
              chatStore.updateTargetSession(session, (session) => {
                const sessionSkill = session.skill;
                sessionSkill.modelConfig.style = style;
              });
              showToast(style);
            }}
          />
        )}

        {toolbar.plugins && showPlugins(currentProviderName, currentModel) && (
          <ChatAction
            onClick={() => {
              if (pluginStore.getAll().length == 0) {
                navigate(Path.Plugins);
              } else {
                setShowPluginSelector(true);
              }
            }}
            text={Locale.Plugin.Name}
            icon={<PluginIcon />}
          />
        )}
        {showPluginSelector && (
          <Selector
            multiple
            defaultSelectedValue={chatStore.currentSession().skill?.plugin}
            items={pluginStore.getAll().map((item) => ({
              title: `${item?.title}@${item?.version}`,
              value: item?.id,
            }))}
            onClose={() => setShowPluginSelector(false)}
            onSelection={(s) => {
              chatStore.updateTargetSession(session, (session) => {
                session.skill.tools = {
                  ...session.skill.tools,
                  apiTools: s as string[],
                };
                syncSkillLegacyPlugin(session.skill);
              });
            }}
          />
        )}

        {!isMobileScreen && toolbar.shortcutKeys && (
          <ChatAction
            onClick={() => props.setShowShortcutKeyModal(true)}
            text={Locale.Chat.ShortcutKey.Title}
            icon={<ShortcutkeyIcon />}
          />
        )}
        {!isMobileScreen && toolbar.tools && <ToolAction />}
      </>
      <div className={styles["chat-input-actions-end"]}>
        {toolbar.realtime && sessionSkill.realtimeConfig?.enabled && (
          <ChatAction
            onClick={() => props.setShowChatSidePanel(true)}
            text={"Realtime Chat"}
            icon={<HeadphoneIcon />}
          />
        )}
      </div>
    </div>
  );
}

export function EditMessageModal(props: { onClose: () => void }) {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const [messages, setMessages] = useState(session.messages.slice());

  return (
    <div className="modal-mask">
      <Modal
        title={Locale.Chat.EditMessage.Title}
        onClose={props.onClose}
        actions={[
          <IconButton
            text={Locale.UI.Cancel}
            icon={<CancelIcon />}
            key="cancel"
            onClick={() => {
              props.onClose();
            }}
          />,
          <IconButton
            type="primary"
            text={Locale.UI.Confirm}
            icon={<ConfirmIcon />}
            key="ok"
            onClick={() => {
              chatStore.updateTargetSession(
                session,
                (session) => (session.messages = messages),
              );
              props.onClose();
            }}
          />,
        ]}
      >
        <List>
          <ListItem
            title={Locale.Chat.EditMessage.Topic.Title}
            subTitle={Locale.Chat.EditMessage.Topic.SubTitle}
          >
            <input
              type="text"
              value={session.topic}
              onInput={(e) =>
                chatStore.updateTargetSession(
                  session,
                  (session) => (session.topic = e.currentTarget.value),
                )
              }
            ></input>
          </ListItem>
        </List>
        <ContextPrompts
          context={messages}
          updateContext={(updater) => {
            const newMessages = messages.slice();
            updater(newMessages);
            setMessages(newMessages);
          }}
        />
      </Modal>
    </div>
  );
}

export function DeleteImageButton(props: { deleteImage: () => void }) {
  return (
    <div className={styles["delete-image"]} onClick={props.deleteImage}>
      <DeleteIcon />
    </div>
  );
}

export function ShortcutKeyModal(props: { onClose: () => void }) {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const shortcuts = [
    {
      title: Locale.Chat.ShortcutKey.newChat,
      keys: isMac ? ["⌘", "Shift", "O"] : ["Ctrl", "Shift", "O"],
    },
    { title: Locale.Chat.ShortcutKey.focusInput, keys: ["Shift", "Esc"] },
    {
      title: Locale.Chat.ShortcutKey.copyLastCode,
      keys: isMac ? ["⌘", "Shift", ";"] : ["Ctrl", "Shift", ";"],
    },
    {
      title: Locale.Chat.ShortcutKey.copyLastMessage,
      keys: isMac ? ["⌘", "Shift", "C"] : ["Ctrl", "Shift", "C"],
    },
    {
      title: Locale.Chat.ShortcutKey.showShortcutKey,
      keys: isMac ? ["⌘", "/"] : ["Ctrl", "/"],
    },
    {
      title: Locale.Chat.ShortcutKey.clearContext,
      keys: isMac
        ? ["⌘", "Shift", "backspace"]
        : ["Ctrl", "Shift", "backspace"],
    },
  ];
  return (
    <div className="modal-mask">
      <Modal
        title={Locale.Chat.ShortcutKey.Title}
        onClose={props.onClose}
        actions={[
          <IconButton
            type="primary"
            text={Locale.UI.Confirm}
            icon={<ConfirmIcon />}
            key="ok"
            onClick={() => {
              props.onClose();
            }}
          />,
        ]}
      >
        <div className={styles["shortcut-key-container"]}>
          <div className={styles["shortcut-key-grid"]}>
            {shortcuts.map((shortcut, index) => (
              <div key={index} className={styles["shortcut-key-item"]}>
                <div className={styles["shortcut-key-title"]}>
                  {shortcut.title}
                </div>
                <div className={styles["shortcut-key-keys"]}>
                  {shortcut.keys.map((key, i) => (
                    <div key={i} className={styles["shortcut-key"]}>
                      <span>{key}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ChatView() {
  type RenderMessage = ChatMessage & { preview?: boolean };

  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const sessionSkill = session.skill;
  const config = useAppConfig();
  const fontSize = config.fontSize;
  const fontFamily = config.fontFamily;
  const isAuthenticated = useAuth();
  const walletAddress = isAuthenticated ? getCurrentAccount() : "";
  const sessionCandidateModels = useMemo(
    () => normalizeModelCandidates(sessionSkill.candidateModels),
    [sessionSkill.candidateModels],
  );
  const allAvailableModels = useSessionModels();
  const sessionModels = useSessionModels(sessionCandidateModels);
  const hasCandidateModelRestriction = sessionCandidateModels.length > 0;
  const textAvailableModels = useMemo(
    () =>
      allAvailableModels.filter((model) => {
        const tags = Array.isArray(model.tags) ? model.tags : [];
        if (tags.length > 0) return tags.includes("text");
        const endpoints = model.supportedEndpoints ?? [];
        if (endpoints.length > 0) return supportsTextEndpoint(endpoints);
        return true;
      }),
    [allAvailableModels],
  );

  const [showExport, setShowExport] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [userInput, setUserInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { submitKey, shouldSubmit } = useSubmitHandler();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isScrolledToBottom = scrollRef?.current
    ? Math.abs(
        scrollRef.current.scrollHeight -
          (scrollRef.current.scrollTop + scrollRef.current.clientHeight),
      ) <= 1
    : false;
  const isAttachWithTop = (() => {
    const lastMessage = scrollRef.current?.lastElementChild as HTMLElement;
    // if scrolllRef is not ready or no message, return false
    if (!scrollRef?.current || !lastMessage) return false;
    const topDistance =
      lastMessage.getBoundingClientRect().top -
      scrollRef.current.getBoundingClientRect().top;
    // leave some space for user question
    return topDistance < 100;
  })();

  const isTyping = userInput !== "";

  // if user is typing, should auto scroll to bottom
  // if user is not typing, should auto scroll to bottom only if already at bottom
  const { setAutoScroll, scrollDomToBottom } = useScrollToBottom(
    scrollRef,
    (isScrolledToBottom || isAttachWithTop) && !isTyping,
    session.messages,
  );
  const [hitBottom, setHitBottom] = useState(true);
  const isMobileScreen = useMobileScreen();
  const navigate = useNavigate();
  const [attachContents, setAttachContents] = useState<MultimodalContent[]>([]);
  const [uploading, setUploading] = useState(false);

  // prompt hints
  const promptStore = usePromptStore();
  const [promptHints, setPromptHints] = useState<RenderPrompt[]>([]);
  const onSearch = useDebouncedCallback(
    (text: string) => {
      const matchedPrompts = promptStore.search(text);
      setPromptHints(matchedPrompts);
    },
    100,
    { leading: true, trailing: true },
  );

  // auto grow input
  const [inputRows, setInputRows] = useState(2);
  const measure = useDebouncedCallback(
    () => {
      const rows = inputRef.current ? autoGrowTextArea(inputRef.current) : 1;
      const inputRows = Math.min(
        20,
        Math.max(2 + Number(!isMobileScreen), rows),
      );
      setInputRows(inputRows);
    },
    100,
    {
      leading: true,
      trailing: true,
    },
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(measure, [userInput]);

  // chat commands shortcuts
  const chatCommands = useChatCommand({
    new: () => chatStore.newSession(),
    newm: () => navigate(Path.NewChat),
    prev: () => chatStore.nextSession(-1),
    next: () => chatStore.nextSession(1),
    clear: () =>
      chatStore.updateTargetSession(
        session,
        (session) => (session.clearContextIndex = session.messages.length),
      ),
    fork: () => chatStore.forkSession(),
    del: () => chatStore.deleteSession(chatStore.currentSessionIndex),
  });

  // only search prompts when user input is short
  const SEARCH_TEXT_LIMIT = 30;
  const buildRouterRedirectTarget = (
    action: "token" | "select" | "recharge" | "renew" | "disabled",
  ) =>
    `${Path.Router}?redirect=${encodeURIComponent(Path.Chat)}&action=${action}`;
  const shouldShowRouterTokenAction = (message: RenderMessage) => {
    if (!message.isError || message.role === "user") return false;

    const content = getMessageTextContent(message);
    return (
      content.includes(ROUTER_TOKEN_REQUIRED_ERROR) ||
      content.includes(Locale.Chat.RouterPrompt.MissingToken)
    );
  };
  const getRouterTokenErrorContent = () =>
    `${ROUTER_TOKEN_REQUIRED_ERROR}，[${Locale.Chat.RouterPrompt.Action}](/#${buildRouterRedirectTarget("select")})。`;
  const hasRouterToken = useAccessStore(
    (state) => state.selectedRouterToken.trim().length > 0,
  );
  const hasRouterApiKey = useAccessStore(
    (state) => state.openaiApiKey.trim().length > 0,
  );
  const routerTokenStatus = useRouterTokenStatus();
  const promptRouterSetup = (
    content: string,
    action: "token" | "select" | "recharge" | "renew" | "disabled" = "token",
    actionText = Locale.Chat.RouterPrompt.Action,
  ) => {
    showToast(
      content,
      {
        text: actionText,
        onClick: () => navigate(buildRouterRedirectTarget(action)),
      },
      5000,
    );
  };
  const getUnavailableModelReason = (): {
    message: string;
    action: "token" | "select" | "recharge" | "renew" | "disabled";
  } => {
    if (!hasRouterToken && !hasRouterApiKey) {
      return {
        message: Locale.Chat.RouterPrompt.MissingToken,
        action: "select",
      };
    }

    if (routerTokenStatus.disabled) {
      return {
        message: Locale.Chat.RouterPrompt.DisabledToken,
        action: "disabled",
      };
    }

    if (routerTokenStatus.expired) {
      return {
        message: Locale.Chat.RouterPrompt.ExpiredToken,
        action: "renew",
      };
    }

    if (routerTokenStatus.depleted) {
      return {
        message: Locale.Chat.RouterPrompt.DepletedToken,
        action: "recharge",
      };
    }

    if (textAvailableModels.length === 0) {
      return {
        message: Locale.Chat.RouterPrompt.NoTextModels,
        action: "token",
      };
    }

    return {
      message: Locale.Chat.RouterPrompt.NoSkillModels,
      action: "token",
    };
  };

  const onInput = (text: string) => {
    setUserInput(text);
    const n = text.trim().length;

    // clear search results
    if (n === 0) {
      setPromptHints([]);
    } else if (text.match(ChatCommandPrefix)) {
      setPromptHints(chatCommands.search(text));
    } else if (!config.disablePromptHint && n < SEARCH_TEXT_LIMIT) {
      // check if need to trigger auto completion
      if (text.startsWith("/")) {
        let searchText = text.slice(1);
        onSearch(searchText);
      }
    }
  };

  const doSubmit = (userInput: string) => {
    if (userInput.trim() === "" && isEmpty(attachContents)) return;
    const matchCommand = chatCommands.match(userInput);
    if (matchCommand.matched) {
      setUserInput("");
      setPromptHints([]);
      matchCommand.invoke();
      return;
    }

    if (hasCandidateModelRestriction && sessionModels.length === 0) {
      const reason = getUnavailableModelReason();
      promptRouterSetup(reason.message, reason.action);
      return;
    }

    const hasCurrentModel = sessionModels.some((model) =>
      matchesModelCandidate(model, {
        model: sessionSkill.modelConfig.model,
        providerName: sessionSkill.modelConfig.providerName,
      }),
    );

    if (hasCandidateModelRestriction && !hasCurrentModel) {
      promptRouterSetup(
        Locale.Chat.RouterPrompt.DefaultModelUnavailable,
        "token",
      );
      return;
    }

    setIsLoading(true);
    chatStore
      .onUserInput(userInput, attachContents)
      .then(() => setIsLoading(false));
    setAttachContents([]);
    chatStore.setLastInput(userInput);
    setUserInput("");
    setPromptHints([]);
    if (!isMobileScreen) inputRef.current?.focus();
    setAutoScroll(true);
  };

  const onPromptSelect = (prompt: RenderPrompt) => {
    setTimeout(() => {
      setPromptHints([]);

      const matchedChatCommand = chatCommands.match(prompt.content);
      if (matchedChatCommand.matched) {
        // if user is selecting a chat command, just trigger it
        matchedChatCommand.invoke();
        setUserInput("");
      } else {
        // or fill the prompt
        setUserInput(prompt.content);
      }
      inputRef.current?.focus();
    }, 30);
  };

  // stop response
  const onUserStop = (messageId: string) => {
    ChatControllerPool.stop(session.id, messageId);
  };

  useEffect(() => {
    chatStore.updateTargetSession(session, (session) => {
      const sessionSkill = session.skill;
      const stopTiming = Date.now() - REQUEST_TIMEOUT_MS;
      session.messages.forEach((m) => {
        // check if should stop all stale messages
        if (m.isError || new Date(m.date).getTime() < stopTiming) {
          if (m.streaming) {
            m.streaming = false;
          }

          if (m.content.length === 0) {
            m.isError = true;
            m.content = prettyObject({
              error: true,
              message: "empty response",
            });
            m.status = "error";
            m.updatedAt = Date.now();
          }
        }
      });

      // auto sync mask config from global config
      const shouldSyncFromGlobal = sessionSkill.syncGlobalConfig !== false;
      if (shouldSyncFromGlobal) {
        sessionSkill.modelConfig = isPlainChatLikeSkill(sessionSkill)
          ? disablePlainChatReasoning(config.modelConfig)
          : { ...config.modelConfig };
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // check if should send message
  const onInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // if ArrowUp and no userInput, fill with last input
    if (
      e.key === "ArrowUp" &&
      userInput.length <= 0 &&
      !(e.metaKey || e.altKey || e.ctrlKey)
    ) {
      setUserInput(chatStore.lastInput ?? "");
      e.preventDefault();
      return;
    }
    if (shouldSubmit(e) && promptHints.length === 0) {
      doSubmit(userInput);
      e.preventDefault();
    }
  };
  const onRightClick = (e: any, message: ChatMessage) => {
    // copy to clipboard
    if (selectOrCopy(e.currentTarget, getMessageTextContent(message))) {
      if (userInput.length === 0) {
        setUserInput(getMessageTextContent(message));
      }

      e.preventDefault();
    }
  };

  const removeMessage = (messageId?: string) => {
    if (!messageId) return;
    chatStore.deleteMessage(session.id, messageId);
  };

  const onDelete = (msgId: string) => {
    removeMessage(msgId);
  };

  const onResend = (message: ChatMessage) => {
    // when it is resending a message
    // 1. for a user's message, find the next bot response
    // 2. for a bot's message, find the last user's input
    // 3. delete original user input and bot's message
    // 4. resend the user's input

    const resendingIndex = session.messages.findIndex(
      (m) => m.id === message.id,
    );

    if (resendingIndex < 0 || resendingIndex >= session.messages.length) {
      console.error("[Chat] failed to find resending message", message);
      return;
    }

    let userMessage: ChatMessage | undefined;
    let botMessage: ChatMessage | undefined;

    if (message.role === "assistant") {
      // if it is resending a bot's message, find the user input for it
      botMessage = message;
      for (let i = resendingIndex; i >= 0; i -= 1) {
        if (session.messages[i].role === "user") {
          userMessage = session.messages[i];
          break;
        }
      }
    } else if (message.role === "user") {
      // if it is resending a user's input, find the bot's response
      userMessage = message;
      for (let i = resendingIndex; i < session.messages.length; i += 1) {
        if (session.messages[i].role === "assistant") {
          botMessage = session.messages[i];
          break;
        }
      }
    }

    if (userMessage === undefined) {
      console.error("[Chat] failed to resend", message);
      return;
    }

    // delete the original messages
    removeMessage(userMessage.id);
    removeMessage(botMessage?.id);

    // resend the message
    setIsLoading(true);
    const textContent = getMessageTextContent(userMessage);
    const attachments = getMessageAttachments(userMessage);

    chatStore
      .onUserInput(textContent, attachments)
      .then(() => setIsLoading(false));
    inputRef.current?.focus();
  };

  const onPinMessage = (message: ChatMessage) => {
    chatStore.updateTargetSession(session, (session) => {
      const sessionSkill = session.skill;
      sessionSkill.context.push(message);
    });

    showToast(Locale.Chat.Actions.PinToastContent, {
      text: Locale.Chat.Actions.PinToastAction,
      onClick: () => {
        setShowPromptModal(true);
      },
    });
  };

  const accessStore = useAccessStore();
  const pendingAutoSubmitInput =
    localStorage.getItem(AUTO_SUBMIT_INPUT(session.id)) ?? "";
  const hasPendingAutoSubmit = pendingAutoSubmitInput.length > 0;
  const [speechStatus, setSpeechStatus] = useState(false);
  const [speechLoading, setSpeechLoading] = useState(false);

  async function openaiSpeech(text: string) {
    if (speechStatus) {
      ttsPlayer.stop();
      setSpeechStatus(false);
    } else {
      var api: ClientApi;
      api = new ClientApi(ModelProvider.GPT);
      const config = useAppConfig.getState();
      setSpeechLoading(true);
      ttsPlayer.init();
      let audioBuffer: ArrayBuffer;
      const { markdownToTxt } = require("markdown-to-txt");
      const textContent = markdownToTxt(text);
      if (config.ttsConfig.engine !== DEFAULT_TTS_ENGINE) {
        const edgeVoiceName = accessStore.edgeVoiceName();
        const tts = new MsEdgeTTS();
        await tts.setMetadata(
          edgeVoiceName,
          OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3,
        );
        audioBuffer = await tts.toArrayBuffer(textContent);
      } else {
        audioBuffer = await api.llm.speech({
          model: config.ttsConfig.model,
          input: textContent,
          voice: config.ttsConfig.voice,
          speed: config.ttsConfig.speed,
        });
      }
      setSpeechStatus(true);
      ttsPlayer
        .play(audioBuffer, () => {
          setSpeechStatus(false);
        })
        .catch((e) => {
          console.error("[OpenAI Speech]", e);
          showToast(prettyObject(e));
          setSpeechStatus(false);
        })
        .finally(() => setSpeechLoading(false));
    }
  }

  const context: RenderMessage[] = useMemo(() => {
    return sessionSkill.hideContext ? [] : sessionSkill.context.slice();
  }, [sessionSkill.context, sessionSkill.hideContext]);

  if (
    !hasPendingAutoSubmit &&
    context.length === 0 &&
    session.messages.length === 0 &&
    !accessStore.isAuthorized()
  ) {
    const unauthorizedMessage = Object.assign({}, BOT_HELLO);
    unauthorizedMessage.content = Locale.Error.Unauthorized;
    context.push(unauthorizedMessage);
  }

  // preview messages
  const renderMessages = useMemo(() => {
    return context
      .concat(session.messages as RenderMessage[])
      .concat(
        isLoading
          ? [
              {
                ...createMessage({
                  role: "assistant",
                  content: "……",
                }),
                preview: true,
              },
            ]
          : [],
      )
      .concat(
        userInput.length > 0 && config.sendPreviewBubble
          ? [
              {
                ...createMessage({
                  role: "user",
                  content: userInput,
                }),
                preview: true,
              },
            ]
          : [],
      );
  }, [
    config.sendPreviewBubble,
    context,
    isLoading,
    session.messages,
    userInput,
  ]);

  const [msgRenderIndex, _setMsgRenderIndex] = useState(
    Math.max(0, renderMessages.length - CHAT_PAGE_SIZE),
  );

  function setMsgRenderIndex(newIndex: number) {
    newIndex = Math.min(renderMessages.length - CHAT_PAGE_SIZE, newIndex);
    newIndex = Math.max(0, newIndex);
    _setMsgRenderIndex(newIndex);
  }

  const messages = useMemo(() => {
    const endRenderIndex = Math.min(
      msgRenderIndex + 3 * CHAT_PAGE_SIZE,
      renderMessages.length,
    );
    return renderMessages.slice(msgRenderIndex, endRenderIndex);
  }, [msgRenderIndex, renderMessages]);

  const onChatBodyScroll = (e: HTMLElement) => {
    const bottomHeight = e.scrollTop + e.clientHeight;
    const edgeThreshold = e.clientHeight;

    const isTouchTopEdge = e.scrollTop <= edgeThreshold;
    const isTouchBottomEdge = bottomHeight >= e.scrollHeight - edgeThreshold;
    const isHitBottom =
      bottomHeight >= e.scrollHeight - (isMobileScreen ? 4 : 10);

    const prevPageMsgIndex = msgRenderIndex - CHAT_PAGE_SIZE;
    const nextPageMsgIndex = msgRenderIndex + CHAT_PAGE_SIZE;

    if (isTouchTopEdge && !isTouchBottomEdge) {
      setMsgRenderIndex(prevPageMsgIndex);
    } else if (isTouchBottomEdge) {
      setMsgRenderIndex(nextPageMsgIndex);
    }

    setHitBottom(isHitBottom);
    setAutoScroll(isHitBottom);
  };

  function scrollToBottom() {
    setMsgRenderIndex(renderMessages.length - CHAT_PAGE_SIZE);
    scrollDomToBottom();
  }

  // clear context index = context length + index in messages
  const clearContextIndex =
    (session.clearContextIndex ?? -1) >= 0
      ? session.clearContextIndex! + context.length - msgRenderIndex
      : -1;

  const [showPromptModal, setShowPromptModal] = useState(false);

  const clientConfig = useMemo(() => getClientConfig(), []);

  const autoFocus = !isMobileScreen; // wont auto focus on mobile screen
  const showMaxIcon = !isMobileScreen && !clientConfig?.isApp;

  useCommand({
    fill: setUserInput,
    submit: (text) => {
      doSubmit(text);
    },
    settings: (text) => {
      if (accessStore.disableFastLink) return;

      try {
        const payload = JSON.parse(text) as {
          key?: string;
          url?: string;
        };

        console.log("[Command] got settings from url: ", payload);

        if (payload.key || payload.url) {
          showConfirm(
            Locale.URLCommand.Settings +
              `\n${JSON.stringify(payload, null, 4)}`,
          ).then((res) => {
            if (!res) return;
            if (payload.key) {
              accessStore.update(
                (access) => (access.openaiApiKey = payload.key!),
              );
            }
            if (payload.url) {
              accessStore.update((access) => (access.openaiUrl = payload.url!));
            }
            accessStore.update((access) => (access.useCustomConfig = true));
          });
        }
      } catch {
        console.error("[Command] failed to get settings from url: ", text);
      }
    },
  });

  // edit / insert message modal
  const [isEditingMessage, setIsEditingMessage] = useState(false);

  // remember unfinished input
  useEffect(() => {
    const unfinishedInputKey = UNFINISHED_INPUT(session.id);
    const autoSubmitInputKey = AUTO_SUBMIT_INPUT(session.id);
    const pendingAutoSubmitInput = localStorage.getItem(autoSubmitInputKey);

    if (pendingAutoSubmitInput) {
      localStorage.removeItem(autoSubmitInputKey);
      setTimeout(() => {
        doSubmit(pendingAutoSubmitInput);
      }, 0);
    } else {
      const mayBeUnfinishedInput = localStorage.getItem(unfinishedInputKey);
      if (mayBeUnfinishedInput && userInput.length === 0) {
        setUserInput(mayBeUnfinishedInput);
        localStorage.removeItem(unfinishedInputKey);
      }
    }

    const dom = inputRef.current;
    return () => {
      localStorage.setItem(unfinishedInputKey, dom?.value ?? "");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  const handlePaste = useCallback(
    async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const currentModelConfig = chatStore.currentSession().skill.modelConfig;
      if (
        !isVisionCapableModel({
          model: currentModelConfig.model,
          tags: currentModelConfig.tags,
        })
      ) {
        return;
      }
      const items = (event.clipboardData || window.clipboardData).items;
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          event.preventDefault();
          const file = item.getAsFile();
          if (file) {
            setUploading(true);
            try {
              const next = [...attachContents];
              next.push(await uploadAttachmentForChat(file));
              if (next.length > 3) {
                next.splice(3, next.length - 3);
              }
              setAttachContents(next);
            } catch (error) {
              showToast(
                `上传失败: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
            } finally {
              setUploading(false);
            }
          }
        }
      }
    },
    [attachContents, chatStore],
  );

  async function uploadImage() {
    const files = await new Promise<File[]>((resolve) => {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept =
        "image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf";
      fileInput.multiple = true;
      fileInput.onchange = (event: any) => {
        resolve(Array.from(event.target.files || []));
      };
      fileInput.click();
    });

    if (files.length === 0) return;

    const next = [...attachContents];
    setUploading(true);
    try {
      for (const file of files) {
        if (next.length >= 3) break;
        next.push(await uploadAttachmentForChat(file));
      }
      setAttachContents(next);
    } catch (error) {
      showToast(
        `上传失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setUploading(false);
    }
  }

  // 快捷键 shortcut keys
  const [showShortcutKeyModal, setShowShortcutKeyModal] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 打开新聊天 command + shift + o
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "o"
      ) {
        event.preventDefault();
        setTimeout(() => {
          chatStore.newSession();
          navigate(Path.Chat);
        }, 10);
      }
      // 聚焦聊天输入 shift + esc
      else if (event.shiftKey && event.key.toLowerCase() === "escape") {
        event.preventDefault();
        inputRef.current?.focus();
      }
      // 复制最后一个代码块 command + shift + ;
      else if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.code === "Semicolon"
      ) {
        event.preventDefault();
        const copyCodeButton =
          document.querySelectorAll<HTMLElement>(".copy-code-button");
        if (copyCodeButton.length > 0) {
          copyCodeButton[copyCodeButton.length - 1].click();
        }
      }
      // 复制最后一个回复 command + shift + c
      else if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "c"
      ) {
        event.preventDefault();
        const lastNonUserMessage = messages
          .filter((message) => message.role !== "user")
          .pop();
        if (lastNonUserMessage) {
          const lastMessageContent = getMessageTextContent(lastNonUserMessage);
          copyToClipboard(lastMessageContent);
        }
      }
      // 展示快捷键 command + /
      else if ((event.metaKey || event.ctrlKey) && event.key === "/") {
        event.preventDefault();
        setShowShortcutKeyModal(true);
      }
      // 清除上下文 command + shift + backspace
      else if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "backspace"
      ) {
        event.preventDefault();
        chatStore.updateTargetSession(session, (session) => {
          if (session.clearContextIndex === session.messages.length) {
            session.clearContextIndex = undefined;
          } else {
            session.clearContextIndex = session.messages.length;
            session.memoryPrompt = ""; // will clear memory
          }
        });
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [messages, chatStore, navigate, session]);

  const [showChatSidePanel, setShowChatSidePanel] = useState(false);

  return (
    <>
      <div className={styles.chat} key={session.id}>
        <div className="window-header" data-tauri-drag-region>
          {isMobileScreen && (
            <div className="window-actions">
              <div className={"window-action-button"}>
                <IconButton
                  icon={<HistoryIcon />}
                  bordered
                  title={Locale.Chat.Actions.ChatList}
                  aria={Locale.Chat.Actions.ChatList}
                  onClick={() => navigate(Path.Home)}
                />
              </div>
            </div>
          )}

          <div
            className={clsx("window-header-title", styles["chat-body-title"])}
          >
            <div
              className={clsx(
                "window-header-main-title",
                styles["chat-body-main-title"],
              )}
              onClickCapture={() => setIsEditingMessage(true)}
            >
              {!session.topic ? DEFAULT_TOPIC : session.topic}
            </div>
            <div className="window-header-sub-title">
              {Locale.Chat.SubTitle(session.messages.length)}
            </div>
          </div>
          <div className="window-actions">
            <div className="window-action-button">
              <IconButton
                icon={<ReloadIcon />}
                bordered
                title={Locale.Chat.Actions.RefreshTitle}
                onClick={() => {
                  showToast(Locale.Chat.Actions.RefreshToast);
                  chatStore.summarizeSession(true, session);
                }}
              />
            </div>
            {!isMobileScreen && (
              <div className="window-action-button">
                <IconButton
                  icon={<RenameIcon />}
                  bordered
                  title={Locale.Chat.EditMessage.Title}
                  aria={Locale.Chat.EditMessage.Title}
                  onClick={() => setIsEditingMessage(true)}
                />
              </div>
            )}
            <div className="window-action-button">
              <IconButton
                icon={<ExportIcon />}
                bordered
                title={Locale.Chat.Actions.Export}
                onClick={() => {
                  setShowExport(true);
                }}
              />
            </div>
            {showMaxIcon && (
              <div className="window-action-button">
                <IconButton
                  icon={config.tightBorder ? <MinIcon /> : <MaxIcon />}
                  bordered
                  title={Locale.Chat.Actions.FullScreen}
                  aria={Locale.Chat.Actions.FullScreen}
                  onClick={() => {
                    config.update(
                      (config) => (config.tightBorder = !config.tightBorder),
                    );
                  }}
                />
              </div>
            )}
          </div>

          <PromptToast
            showToast={!hitBottom}
            showModal={showPromptModal}
            setShowModal={setShowPromptModal}
          />
        </div>
        <div className={styles["chat-main"]}>
          <div className={styles["chat-body-container"]}>
            <div
              className={styles["chat-body"]}
              ref={scrollRef}
              onScroll={(e) => onChatBodyScroll(e.currentTarget)}
              onMouseDown={() => inputRef.current?.blur()}
              onTouchStart={() => {
                inputRef.current?.blur();
                setAutoScroll(false);
              }}
            >
              {messages
                // TODO
                // .filter((m) => !m.isToolResponse)
                .map((message, i) => {
                  const isUser = message.role === "user";
                  const isContext = i < context.length;
                  const showActions =
                    !(
                      message.preview || getMessageContentLength(message) === 0
                    ) && !isContext;
                  const showTyping = message.preview || message.streaming;
                  const messageImages = getMessageImages(message);
                  const showRouterTokenAction =
                    shouldShowRouterTokenAction(message);
                  const messageTextContent = showRouterTokenAction
                    ? getRouterTokenErrorContent()
                    : getMessageTextContent(message);

                  const shouldShowClearContextDivider =
                    i === clearContextIndex - 1;

                  return (
                    <Fragment key={message.id}>
                      <div
                        className={
                          isUser
                            ? styles["chat-message-user"]
                            : styles["chat-message"]
                        }
                      >
                        <div className={styles["chat-message-container"]}>
                          <div className={styles["chat-message-header"]}>
                            <div className={styles["chat-message-avatar"]}>
                              <div className={styles["chat-message-edit"]}>
                                <IconButton
                                  icon={<EditIcon />}
                                  aria={Locale.Chat.Actions.Edit}
                                  onClick={async () => {
                                    const newMessage = await showPrompt(
                                      Locale.Chat.Actions.Edit,
                                      getMessageTextContent(message),
                                      10,
                                    );
                                    let newContent:
                                      | string
                                      | MultimodalContent[] = newMessage;
                                    const attachments =
                                      getMessageAttachments(message);
                                    if (attachments.length > 0) {
                                      newContent = [
                                        { type: "text", text: newMessage },
                                      ];
                                      for (const item of attachments) {
                                        newContent.push({ ...item });
                                      }
                                    }
                                    chatStore.updateTargetSession(
                                      session,
                                      (session) => {
                                        const sessionSkill = session.skill;
                                        const m = sessionSkill.context
                                          .concat(session.messages)
                                          .find((m) => m.id === message.id);
                                        if (m) {
                                          m.content = newContent;
                                        }
                                      },
                                    );
                                  }}
                                ></IconButton>
                              </div>
                              {isUser ? (
                                <Avatar
                                  avatar={config.avatar}
                                  address={walletAddress || undefined}
                                />
                              ) : (
                                <>
                                  {["system"].includes(message.role) ? (
                                    <Avatar avatar="2699-fe0f" />
                                  ) : (
                                    <SkillAvatar
                                      avatar={sessionSkill.avatar}
                                      model={
                                        message.model ||
                                        sessionSkill.modelConfig.model
                                      }
                                    />
                                  )}
                                </>
                              )}
                            </div>
                            {!isUser && (
                              <div className={styles["chat-model-name"]}>
                                {message.model}
                              </div>
                            )}

                            {showActions && (
                              <div className={styles["chat-message-actions"]}>
                                <div className={styles["chat-input-actions"]}>
                                  {message.streaming ? (
                                    <ChatAction
                                      text={Locale.Chat.Actions.Stop}
                                      icon={<StopIcon />}
                                      onClick={() =>
                                        onUserStop(message.id ?? i)
                                      }
                                    />
                                  ) : (
                                    <>
                                      <ChatAction
                                        text={Locale.Chat.Actions.Retry}
                                        icon={<ResetIcon />}
                                        onClick={() => onResend(message)}
                                      />

                                      <ChatAction
                                        text={Locale.Chat.Actions.Delete}
                                        icon={<DeleteIcon />}
                                        onClick={() =>
                                          onDelete(message.id ?? i)
                                        }
                                      />

                                      <ChatAction
                                        text={Locale.Chat.Actions.Pin}
                                        icon={<PinIcon />}
                                        onClick={() => onPinMessage(message)}
                                      />
                                      <ChatAction
                                        text={Locale.Chat.Actions.Copy}
                                        icon={<CopyIcon />}
                                        onClick={() =>
                                          copyToClipboard(
                                            getMessageTextContent(message),
                                          )
                                        }
                                      />
                                      {config.ttsConfig.enable && (
                                        <ChatAction
                                          text={
                                            speechStatus
                                              ? Locale.Chat.Actions.StopSpeech
                                              : Locale.Chat.Actions.Speech
                                          }
                                          icon={
                                            speechStatus ? (
                                              <SpeakStopIcon />
                                            ) : (
                                              <SpeakIcon />
                                            )
                                          }
                                          onClick={() =>
                                            openaiSpeech(
                                              getMessageTextContent(message),
                                            )
                                          }
                                        />
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                          {message?.tools?.length == 0 && showTyping && (
                            <div className={styles["chat-message-status"]}>
                              {Locale.Chat.Typing}
                            </div>
                          )}
                          {/*@ts-ignore*/}
                          {message?.tools?.length > 0 && (
                            <div className={styles["chat-message-tools"]}>
                              {message?.tools?.map((tool) => (
                                <div
                                  key={tool.id}
                                  title={tool?.errorMsg}
                                  className={styles["chat-message-tool"]}
                                >
                                  {tool.isError === false ? (
                                    <ConfirmIcon />
                                  ) : tool.isError === true ? (
                                    <CloseIcon />
                                  ) : (
                                    <LoadingButtonIcon />
                                  )}
                                  <span>{tool?.function?.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className={styles["chat-message-item"]}>
                            <Markdown
                              key={message.streaming ? "loading" : "done"}
                              content={messageTextContent}
                              loading={
                                (message.preview || message.streaming) &&
                                getMessageContentLength(message) === 0 &&
                                !isUser
                              }
                              //   onContextMenu={(e) => onRightClick(e, message)} // hard to use
                              onDoubleClickCapture={() => {
                                if (!isMobileScreen) return;
                                setUserInput(getMessageTextContent(message));
                              }}
                              fontSize={fontSize}
                              fontFamily={fontFamily}
                              parentRef={scrollRef}
                              defaultShow={i >= messages.length - 6}
                            />
                            {messageImages.length == 1 && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                className={styles["chat-message-item-image"]}
                                src={messageImages[0]}
                                alt=""
                                onClick={() =>
                                  showImageModal(messageImages[0], true)
                                }
                              />
                            )}
                            {messageImages.length > 1 && (
                              <div
                                className={styles["chat-message-item-images"]}
                                style={
                                  {
                                    "--image-count": messageImages.length,
                                  } as React.CSSProperties
                                }
                              >
                                {messageImages.map((image, index) => {
                                  return (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      className={
                                        styles["chat-message-item-image-multi"]
                                      }
                                      key={index}
                                      src={image}
                                      alt=""
                                      onClick={() =>
                                        showImageModal(image, true)
                                      }
                                    />
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          {message?.audio_url && (
                            <div className={styles["chat-message-audio"]}>
                              <audio src={message.audio_url} controls />
                            </div>
                          )}

                          <div className={styles["chat-message-action-date"]}>
                            {isContext
                              ? Locale.Chat.IsContext
                              : message.date.toLocaleString()}
                          </div>
                        </div>
                      </div>
                      {shouldShowClearContextDivider && <ClearContextDivider />}
                    </Fragment>
                  );
                })}
            </div>
            <div className={styles["chat-input-panel"]}>
              <PromptHints
                prompts={promptHints}
                onPromptSelect={onPromptSelect}
              />

              <ChatActions
                uploadImage={uploadImage}
                setAttachContents={setAttachContents}
                setUploading={setUploading}
                showPromptModal={() => setShowPromptModal(true)}
                scrollToBottom={scrollToBottom}
                hitBottom={hitBottom}
                uploading={uploading}
                showPromptHints={() => {
                  // Click again to close
                  if (promptHints.length > 0) {
                    setPromptHints([]);
                    return;
                  }

                  inputRef.current?.focus();
                  setUserInput("/");
                  onSearch("");
                }}
                setShowShortcutKeyModal={setShowShortcutKeyModal}
                setUserInput={setUserInput}
                setShowChatSidePanel={setShowChatSidePanel}
              />
              <label
                className={clsx(styles["chat-input-panel-inner"], {
                  [styles["chat-input-panel-inner-attach"]]:
                    attachContents.length !== 0,
                })}
                htmlFor="chat-input"
              >
                <textarea
                  id="chat-input"
                  ref={inputRef}
                  className={styles["chat-input"]}
                  placeholder={Locale.Chat.Input(submitKey)}
                  onInput={(e) => onInput(e.currentTarget.value)}
                  value={userInput}
                  onKeyDown={onInputKeyDown}
                  onFocus={scrollToBottom}
                  onClick={scrollToBottom}
                  onPaste={handlePaste}
                  rows={inputRows}
                  autoFocus={autoFocus}
                  style={{
                    fontSize: config.fontSize,
                    fontFamily: config.fontFamily,
                  }}
                />
                {attachContents.length != 0 && (
                  <div className={styles["attach-images"]}>
                    {attachContents.map((item, index) => {
                      const imageUrl =
                        item.type === "image_url"
                          ? item.image_url?.url || ""
                          : "";
                      const fileName =
                        item.type === "file_url"
                          ? item.file_url?.name || "PDF"
                          : "";
                      return (
                        <div
                          key={index}
                          className={styles["attach-image"]}
                          style={
                            imageUrl
                              ? { backgroundImage: `url("${imageUrl}")` }
                              : undefined
                          }
                        >
                          {!imageUrl && (
                            <div className={styles["attach-file-name"]}>
                              {fileName}
                            </div>
                          )}
                          <div className={styles["attach-image-mask"]}>
                            <DeleteImageButton
                              deleteImage={() => {
                                setAttachContents(
                                  attachContents.filter((_, i) => i !== index),
                                );
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <IconButton
                  icon={<SendWhiteIcon />}
                  text={Locale.Chat.Send}
                  className={styles["chat-input-send"]}
                  type="primary"
                  onClick={() => doSubmit(userInput)}
                />
              </label>
            </div>
          </div>
          <div
            className={clsx(styles["chat-side-panel"], {
              [styles["mobile"]]: isMobileScreen,
              [styles["chat-side-panel-show"]]: showChatSidePanel,
            })}
          >
            {showChatSidePanel && (
              <RealtimeChat
                onClose={() => {
                  setShowChatSidePanel(false);
                }}
                onStartVoice={async () => {
                  console.log("start voice");
                }}
              />
            )}
          </div>
        </div>
      </div>
      {showExport && (
        <ExportMessageModal onClose={() => setShowExport(false)} />
      )}

      {isEditingMessage && (
        <EditMessageModal
          onClose={() => {
            setIsEditingMessage(false);
          }}
        />
      )}

      {showShortcutKeyModal && (
        <ShortcutKeyModal onClose={() => setShowShortcutKeyModal(false)} />
      )}
    </>
  );
}

export function Chat() {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  return <ChatView key={session.id}></ChatView>;
}
