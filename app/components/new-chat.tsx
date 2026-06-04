import { AUTO_SUBMIT_INPUT, Path, UNFINISHED_INPUT } from "../constant";
import { IconButton } from "./button";
import styles from "./new-chat.module.scss";

import LeftIcon from "../icons/left.svg";
import EyeIcon from "../icons/eye.svg";
import RobotIcon from "../icons/robot.svg";
import SendWhiteIcon from "../icons/send-white.svg";

import { useNavigate } from "react-router-dom";
import { getLaunchableSkills, Skill, useSkillStore } from "../store/skill";
import Locale from "../locales";
import { ModelType, useAppConfig, useChatStore } from "../store";
import { useSdStore } from "../store/sd";
import { SkillAvatar } from "./mask";
import { useCommand } from "../command";
import { BUILTIN_SKILL_STORE } from "../skills";
import clsx from "clsx";
import { useMemo, useState } from "react";
import { safeLocalStorage } from "../utils";
import { useSessionModels } from "../utils/hooks";
import { getModelProvider, normalizeProviderName } from "../utils/model";
import { ServiceProvider } from "../constant";

function SkillItem(props: { skill: Skill; onClick?: () => void }) {
  return (
    <div className={styles["mask"]} onClick={props.onClick}>
      <SkillAvatar
        avatar={props.skill.avatar}
        model={props.skill.modelConfig.model}
      />
      <div className={styles["mask-texts"]}>
        <div className={clsx(styles["mask-name"], "one-line")}>
          {props.skill.name}
        </div>
      </div>
    </div>
  );
}

const localStorage = safeLocalStorage();

export function NewChat() {
  const chatStore = useChatStore();
  const skillStore = useSkillStore();
  const sdStore = useSdStore();
  const config = useAppConfig();
  const [draft, setDraft] = useState("");
  const [selectedModelValue, setSelectedModelValue] = useState("");

  const skills = useMemo(
    () => getLaunchableSkills(skillStore.getAll()),
    [skillStore],
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
        seen.add(key);
        return true;
      })
      .slice(0, 3);
  }, [chatStore.sessions]);
  const entrySkills = useMemo(() => {
    const seen = new Set<string>();
    return [...recentSkills, ...skills]
      .filter((skill) => {
        const key = skill.id || skill.name;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);
  }, [recentSkills, skills]);
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

  const startDraftChat = () => startChat(undefined, draft, activeModelValue);
  const startSkill = (skill?: Skill) => {
    if (!skill) return;

    if (skill.launch?.type === "sd") {
      const input = draft.trim();
      sdStore.setCurrentMode("generation");
      if (input) {
        sdStore.setCurrentParams({
          ...useSdStore.getState().currentParams,
          prompt: input,
        });
      }
      navigate(Path.Sd);
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
            {Locale.NewChat.BlankTitle}
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
          onClick={() => navigate(Path.Skills)}
          icon={<EyeIcon />}
          bordered
        />
      </div>

      <div className={styles["featured-masks"]}>
        {entrySkills.map((skill) => (
          <SkillItem
            key={skill.id}
            skill={skill}
            onClick={() => startSkill(skill)}
          />
        ))}
      </div>
    </div>
  );
}
