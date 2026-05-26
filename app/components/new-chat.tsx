import { Path } from "../constant";
import { IconButton } from "./button";
import styles from "./new-chat.module.scss";

import LeftIcon from "../icons/left.svg";
import LightningIcon from "../icons/lightning.svg";
import EyeIcon from "../icons/eye.svg";

import { useLocation, useNavigate } from "react-router-dom";
import { Skill, useSkillStore } from "../store/skill";
import Locale from "../locales";
import { useAppConfig, useChatStore } from "../store";
import { MaskAvatar } from "./mask";
import { useCommand } from "../command";
import { showConfirm } from "./ui-lib";
import { BUILTIN_SKILL_STORE } from "../skills";
import clsx from "clsx";

function SkillItem(props: {
  skill: Skill;
  onClick?: () => void;
  detailed?: boolean;
}) {
  return (
    <div
      className={clsx(
        styles["mask"],
        props.detailed && styles["mask-detailed"],
      )}
      onClick={props.onClick}
    >
      <MaskAvatar
        avatar={props.skill.avatar}
        model={props.skill.modelConfig.model}
      />
      <div className={styles["mask-texts"]}>
        <div className={clsx(styles["mask-name"], "one-line")}>
          {props.skill.name}
        </div>
        {props.detailed && props.skill.description && (
          <div className={styles["mask-desc"]}>{props.skill.description}</div>
        )}
        {props.detailed &&
          props.skill.starters &&
          props.skill.starters.length > 0 && (
            <div className={styles["mask-starters"]}>
              {props.skill.starters.slice(0, 2).map((starter) => (
                <div key={starter} className={styles["mask-starter"]}>
                  {starter}
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

export function NewChat() {
  const chatStore = useChatStore();
  const skillStore = useSkillStore();

  const skills = skillStore.getAll();

  const navigate = useNavigate();
  const config = useAppConfig();

  const { state } = useLocation();

  const startChat = (skill?: Skill) => {
    setTimeout(() => {
      if (chatStore.newSession(skill) !== false) {
        navigate(Path.Chat);
      }
    }, 10);
  };

  useCommand({
    mask: (id) => {
      try {
        const skill = skillStore.get(id) ?? BUILTIN_SKILL_STORE.get(id);
        startChat(skill ?? undefined);
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
        {!state?.fromHome && (
          <IconButton
            text={Locale.NewChat.NotShow}
            onClick={async () => {
              if (await showConfirm(Locale.NewChat.ConfirmNoShow)) {
                startChat();
                config.update(
                  (config) => (config.dontShowMaskSplashScreen = true),
                );
              }
            }}
          ></IconButton>
        )}
      </div>
      <div className={styles["title"]}>{Locale.NewChat.Title}</div>
      <div className={styles["sub-title"]}>{Locale.NewChat.SubTitle}</div>

      <div className={styles["actions"]}>
        <IconButton
          text={Locale.NewChat.More}
          onClick={() => navigate(Path.Skills)}
          icon={<EyeIcon />}
          bordered
          shadow
        />

        <IconButton
          text={Locale.NewChat.Skip}
          onClick={() => startChat()}
          icon={<LightningIcon />}
          type="primary"
          shadow
          className={styles["skip"]}
        />
      </div>

      <div className={styles["featured-title"]}>
        {Locale.NewChat.FeaturedTitle}
      </div>
      <div className={styles["featured-subtitle"]}>
        {Locale.NewChat.FeaturedSubTitle}
      </div>

      <div className={styles["featured-masks"]}>
        {skills.map((skill) => (
          <SkillItem
            key={skill.id}
            skill={skill}
            detailed
            onClick={() => startChat(skill)}
          />
        ))}
      </div>
    </div>
  );
}
