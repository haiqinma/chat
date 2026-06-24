import { AUTO_SUBMIT_INPUT, Path, UNFINISHED_INPUT } from "../constant";
import { IconButton } from "./button";
import styles from "./new-chat.module.scss";

import LeftIcon from "../icons/left.svg";
import EyeIcon from "../icons/eye.svg";
import RobotIcon from "../icons/robot.svg";
import SendWhiteIcon from "../icons/send-white.svg";
import DeleteIcon from "../icons/delete.svg";

import { useNavigate } from "react-router-dom";
import { getLaunchableSkills, Skill, useSkillStore } from "../store/skill";
import Locale from "../locales";
import { ModelType, useAppConfig, useChatStore } from "../store";
import { useSdStore } from "../store/sd";
import { SkillAvatar } from "./mask";
import { useCommand } from "../command";
import { BUILTIN_SKILL_STORE } from "../skills";
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { safeLocalStorage } from "../utils";
import { useSessionModels } from "../utils/hooks";
import { getModelProvider, normalizeProviderName } from "../utils/model";
import { ServiceProvider } from "../constant";
import { useAccessStore } from "../store/access";
import {
  getSkillRuntimeStatusOrder,
  hasSkillToolRuntimeIssue,
  resolveSkillRuntimeStatus,
  SkillRuntimeResult,
} from "../skills/runtime";
import { usePluginStore } from "../store/plugin";
import { getClientsStatus, getToolConfigFromFile } from "../tools/actions";
import { ToolConfigData, ServerStatusResponse } from "../tools/types";

function SkillItem(props: {
  skill: Skill;
  runtime: SkillRuntimeResult;
  statusLabel?: string;
  onClick?: () => void;
  onDelete?: () => void;
  deletable?: boolean;
}) {
  const tooltip = [
    props.skill.description || props.skill.name,
    ...props.runtime.issues.map((issue) => issue.message),
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <div
      className={styles["mask"]}
      onClick={props.onClick}
      title={tooltip}
      aria-label={tooltip}
    >
      <SkillAvatar
        avatar={props.skill.avatar}
        model={props.skill.modelConfig.model}
      />
      <div className={styles["mask-texts"]}>
        <div className={clsx(styles["mask-name"], "one-line")}>
          {props.skill.name}
        </div>
        {props.statusLabel && (
          <div className={styles["mask-status"]}>{props.statusLabel}</div>
        )}
      </div>
      {props.deletable && props.onDelete && (
        <button
          className={styles["mask-delete"]}
          title={`删除 ${props.skill.name}`}
          aria-label={`删除 ${props.skill.name}`}
          onClick={(event) => {
            event.stopPropagation();
            props.onDelete?.();
          }}
        >
          <DeleteIcon />
        </button>
      )}
    </div>
  );
}

const localStorage = safeLocalStorage();
const HIDDEN_ORPHAN_SKILL_KEYS = "hidden-orphan-skill-keys";

function getSkillEntryKey(skill: Skill) {
  if (skill.packageId) return `package:${skill.packageId}`;
  if (skill.createdAt && skill.lang && skill.name) {
    return `skill:${skill.lang}:${skill.createdAt}:${skill.name}`;
  }
  return skill.id || skill.name;
}

function isGeneralChatSkill(skill: Skill) {
  return (
    skill.name === "通用问答" ||
    skill.name === "Direct Chat" ||
    skill.createdAt === 1700000001001 ||
    skill.createdAt === 1700000002001
  );
}

export function NewChat() {
  const chatStore = useChatStore();
  const skillStore = useSkillStore();
  const sdStore = useSdStore();
  const config = useAppConfig();
  const accessStore = useAccessStore();
  const plugins = usePluginStore((state) => state.plugins);
  const [draft, setDraft] = useState("");
  const [selectedModelValue, setSelectedModelValue] = useState("");
  const [toolConfig, setToolConfig] = useState<ToolConfigData>();
  const [toolStatuses, setToolStatuses] = useState<
    Record<string, ServerStatusResponse> | undefined
  >();
  const [hiddenOrphanSkillKeys, setHiddenOrphanSkillKeys] = useState(() => {
    const raw = localStorage.getItem(HIDDEN_ORPHAN_SKILL_KEYS);
    if (!raw) return [] as string[];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  });

  const skills = useMemo(
    () => getLaunchableSkills(Object.values(skillStore.skills)),
    [skillStore],
  );
  const currentSkillKeys = useMemo(
    () => new Set(skills.map((skill) => getSkillEntryKey(skill))),
    [skills],
  );
  const defaultChatSkill = useMemo(
    () => skills.find(isGeneralChatSkill),
    [skills],
  );
  const recentSkills = useMemo(() => {
    const seen = new Set<string>();
    return chatStore.sessions
      .slice()
      .sort((a, b) => b.lastUpdate - a.lastUpdate)
      .map((session) => session.mask as Skill | undefined)
      .filter((skill): skill is Skill => {
        if (!skill) return false;
        const hasSkillContent =
          skill.context?.length > 0 ||
          !!skill.description ||
          !!skill.category ||
          !!skill.starters?.length;
        if (!hasSkillContent) return false;
        const key = skill.id || skill.name;
        if (!key || seen.has(key)) return false;
        if (!currentSkillKeys.has(getSkillEntryKey(skill))) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 3);
  }, [chatStore.sessions, currentSkillKeys]);
  const installedPluginIds = useMemo(() => Object.keys(plugins), [plugins]);
  const installedToolServerIds = useMemo(
    () => Object.keys(toolConfig?.toolServers ?? {}),
    [toolConfig?.toolServers],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([getToolConfigFromFile(), getClientsStatus()])
      .then(([config, statuses]) => {
        if (!cancelled) {
          setToolConfig(config);
          setToolStatuses(statuses);
        }
      })
      .catch((error) => {
        console.warn("[NewChat] failed to load tool config", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const skillRuntimeMap = useMemo(() => {
    return new Map(
      [...recentSkills, ...skills].map((skill) => [
        getSkillEntryKey(skill),
        resolveSkillRuntimeStatus({
          skill,
          models: config.models,
          customModels: config.customModels,
          accessCustomModels: accessStore.customModels,
          defaultModel: accessStore.defaultModel,
          globalModelConfig: config.modelConfig,
          installedPluginIds,
          installedToolServerIds,
          toolStatuses,
        }),
      ]),
    );
  }, [
    accessStore.customModels,
    accessStore.defaultModel,
    config.customModels,
    config.modelConfig,
    config.models,
    installedToolServerIds,
    installedPluginIds,
    toolStatuses,
    recentSkills,
    skills,
  ]);
  const entrySkills = useMemo(() => {
    const seen = new Set<string>();
    const hiddenKeys = new Set(hiddenOrphanSkillKeys);
    return [...recentSkills, ...skills]
      .filter((skill) => {
        if (
          defaultChatSkill &&
          getSkillEntryKey(skill) === getSkillEntryKey(defaultChatSkill)
        ) {
          return false;
        }
        const key = getSkillEntryKey(skill);
        if (!key || seen.has(key)) return false;
        if (hiddenKeys.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        const aRuntime = skillRuntimeMap.get(getSkillEntryKey(a));
        const bRuntime = skillRuntimeMap.get(getSkillEntryKey(b));
        const statusDiff =
          getSkillRuntimeStatusOrder(aRuntime?.status ?? "unavailable") -
          getSkillRuntimeStatusOrder(bRuntime?.status ?? "unavailable");
        if (statusDiff !== 0) return statusDiff;
        return b.createdAt - a.createdAt;
      })
      .slice(0, 8);
  }, [
    defaultChatSkill,
    hiddenOrphanSkillKeys,
    recentSkills,
    skillRuntimeMap,
    skills,
  ]);
  const entrySkillItems = useMemo(
    () =>
      entrySkills.map((skill) => {
        const runtime =
          skillRuntimeMap.get(getSkillEntryKey(skill)) ??
          resolveSkillRuntimeStatus({
            skill,
            models: config.models,
            customModels: config.customModels,
            accessCustomModels: accessStore.customModels,
            defaultModel: accessStore.defaultModel,
            globalModelConfig: config.modelConfig,
            installedPluginIds,
            installedToolServerIds,
            toolStatuses,
          });
        const statusLabel =
          runtime.status === "ready"
            ? undefined
            : runtime.status === "needs_config"
              ? Locale.Discovery.Status.Configurable
              : Locale.Discovery.Status.Unavailable;

        return {
          skill,
          runtime,
          statusLabel,
        };
      }),
    [
      accessStore.customModels,
      accessStore.defaultModel,
      config.customModels,
      config.modelConfig,
      config.models,
      entrySkills,
      installedToolServerIds,
      installedPluginIds,
      toolStatuses,
      skillRuntimeMap,
    ],
  );
  const availableModels = useSessionModels();

  const navigate = useNavigate();

  const fallbackModelValue = useMemo(() => {
    const preferredModel = config.modelConfig.model;
    const preferredProviderName =
      normalizeProviderName(config.modelConfig.providerName) ??
      ServiceProvider.OpenAI;
    const matchedModel = availableModels.find(
      (model) =>
        model.name === preferredModel &&
        model.provider?.providerName === preferredProviderName,
    );
    const fallbackModel =
      matchedModel ??
      availableModels.find((model) => model.isDefault) ??
      availableModels[0];

    if (fallbackModel) {
      return `${fallbackModel.name}@${fallbackModel.provider?.providerName}`;
    }

    return `${preferredModel}@${preferredProviderName}`;
  }, [
    availableModels,
    config.modelConfig.model,
    config.modelConfig.providerName,
  ]);

  const activeModelValue = useMemo(() => {
    const modelStillAvailable = availableModels.some(
      (model) =>
        `${model.name}@${model.provider?.providerName}` === selectedModelValue,
    );
    return modelStillAvailable ? selectedModelValue : fallbackModelValue;
  }, [availableModels, fallbackModelValue, selectedModelValue]);

  const currentModelLabel = useMemo(() => {
    const currentModel = availableModels.find(
      (model) =>
        `${model.name}@${model.provider?.providerName}` === activeModelValue,
    );
    if (currentModel) {
      return currentModel.displayName ?? currentModel.name;
    }
    const [modelName] = getModelProvider(activeModelValue);
    return modelName || config.modelConfig.model;
  }, [activeModelValue, availableModels, config.modelConfig.model]);

  const startChat = (skill?: Skill, initialInput = "", modelValue?: string) => {
    if (chatStore.newSession(skill) === false) {
      return;
    }

    const input = initialInput.trim();
    const session = useChatStore.getState().sessions[0];
    if (session && modelValue) {
      const [model, providerName] = getModelProvider(modelValue);
      const normalizedProviderName =
        normalizeProviderName(providerName) ??
        session.mask.modelConfig.providerName;

      if (
        model &&
        (session.mask.modelConfig.model !== model ||
          session.mask.modelConfig.providerName !== normalizedProviderName)
      ) {
        useChatStore.getState().updateTargetSession(session, (draftSession) => {
          draftSession.mask.modelConfig.model = model as ModelType;
          draftSession.mask.modelConfig.providerName =
            normalizedProviderName as ServiceProvider;
          draftSession.mask.syncGlobalConfig = false;
        });
      }
    }

    if (input && session?.id) {
      localStorage.removeItem(UNFINISHED_INPUT(session.id));
      localStorage.setItem(AUTO_SUBMIT_INPUT(session.id), input);
    }

    navigate(Path.Chat);
  };

  const startDraftChat = () =>
    startChat(defaultChatSkill, draft, activeModelValue);
  const hideOrphanSkill = (skill: Skill) => {
    const key = getSkillEntryKey(skill);
    if (!key) return;
    setHiddenOrphanSkillKeys((current) => {
      if (current.includes(key)) return current;
      const next = [...current, key];
      localStorage.setItem(HIDDEN_ORPHAN_SKILL_KEYS, JSON.stringify(next));
      return next;
    });
  };
  const startSkill = (skill?: Skill) => {
    if (!skill) return;

    if (skill.launch?.type === "sd") {
      const input = draft.trim();
      sdStore.startBlankCreation(input);
      navigate(Path.Sd);
      return;
    }

    const runtime = skillRuntimeMap.get(getSkillEntryKey(skill));
    if (runtime && runtime.status !== "ready") {
      navigate(
        hasSkillToolRuntimeIssue(runtime) ? Path.ToolMarket : Path.Skills,
      );
      return;
    }

    startChat(skill);
  };

  useCommand({
    mask: (id) => {
      try {
        const skill = skillStore.get(id) ?? BUILTIN_SKILL_STORE.get(id);
        startSkill(skill);
      } catch {
        console.error("[New Chat] failed to create chat from skill id=", id);
      }
    },
    skill: (id) => {
      try {
        const skill = skillStore.get(id) ?? BUILTIN_SKILL_STORE.get(id);
        startSkill(skill);
      } catch {
        console.error("[New Chat] failed to create chat from skill id=", id);
      }
    },
  });

  return (
    <div className={styles["new-chat"]}>
      <div className={styles["mask-header"]}>
        <IconButton
          icon={<LeftIcon />}
          text={Locale.NewChat.Return}
          onClick={() => navigate(Path.Home)}
        ></IconButton>
      </div>
      <div className={styles["title"]}>{Locale.Home.NewChat}</div>

      <div className={styles["launch-panel"]}>
        <textarea
          className={styles["launch-input"]}
          value={draft}
          placeholder={Locale.NewChat.Placeholder}
          rows={3}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              startDraftChat();
            }
          }}
        />
        <div className={styles["launch-actions"]}>
          <label className={styles["model-selector"]}>
            <RobotIcon />
            <select
              value={activeModelValue}
              onChange={(event) => setSelectedModelValue(event.target.value)}
            >
              {availableModels.map((model) => (
                <option
                  key={`${model.name}@${model.provider?.providerName}`}
                  value={`${model.name}@${model.provider?.providerName}`}
                >
                  {`${model.displayName ?? model.name}${
                    model.provider?.providerName
                      ? ` (${model.provider.providerName})`
                      : ""
                  }`}
                </option>
              ))}
              {availableModels.length === 0 && (
                <option value={activeModelValue || config.modelConfig.model}>
                  {currentModelLabel}
                </option>
              )}
            </select>
          </label>
          <button
            className={styles["send-action"]}
            onClick={startDraftChat}
            type="button"
          >
            {defaultChatSkill?.name || Locale.NewChat.BlankTitle}
            <SendWhiteIcon />
          </button>
        </div>
      </div>

      <div className={styles["section-header"]}>
        <div>
          <div className={styles["section-title"]}>
            {Locale.NewChat.FeaturedTitle}
          </div>
        </div>
        <IconButton
          text={Locale.NewChat.More}
          onClick={() => navigate(`${Path.Discovery}?type=skill`)}
          icon={<EyeIcon />}
          bordered
        />
      </div>

      <div className={styles["featured-masks"]}>
        {entrySkillItems.length === 0 && (
          <div className={styles["empty-skills"]}>
            <span>{Locale.NewChat.EmptySkills}</span>
            <button
              type="button"
              onClick={() => navigate(`${Path.Discovery}?type=skill`)}
            >
              {Locale.NewChat.ExploreSkills}
            </button>
          </div>
        )}
        {entrySkillItems.map(({ skill, runtime, statusLabel }) => (
          <SkillItem
            key={skill.id}
            skill={skill}
            runtime={runtime}
            statusLabel={statusLabel}
            onClick={() => startSkill(skill)}
            deletable={
              !skill.builtin && !currentSkillKeys.has(getSkillEntryKey(skill))
            }
            onDelete={() => hideOrphanSkill(skill)}
          />
        ))}
      </div>
    </div>
  );
}
