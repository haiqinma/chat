import { Path } from "../constant";
import { IconButton } from "./button";
import styles from "./new-chat.module.scss";

import LeftIcon from "../icons/left.svg";
import LightningIcon from "../icons/lightning.svg";
import EyeIcon from "../icons/eye.svg";

import { useLocation, useNavigate } from "react-router-dom";
import { Mask, useMaskStore } from "../store/mask";
import Locale from "../locales";
import { useAppConfig, useChatStore } from "../store";
import { MaskAvatar } from "./mask";
import { useCommand } from "../command";
import { showConfirm } from "./ui-lib";
import { BUILTIN_MASK_STORE } from "../masks";
import clsx from "clsx";

function MaskItem(props: {
  mask: Mask;
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
        avatar={props.mask.avatar}
        model={props.mask.modelConfig.model}
      />
      <div className={styles["mask-texts"]}>
        <div className={clsx(styles["mask-name"], "one-line")}>
          {props.mask.name}
        </div>
        {props.detailed && props.mask.description && (
          <div className={styles["mask-desc"]}>{props.mask.description}</div>
        )}
        {props.detailed &&
          props.mask.starters &&
          props.mask.starters.length > 0 && (
            <div className={styles["mask-starters"]}>
              {props.mask.starters.slice(0, 2).map((starter) => (
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
  const maskStore = useMaskStore();

  const masks = maskStore.getAll();

  const navigate = useNavigate();
  const config = useAppConfig();

  const { state } = useLocation();

  const startChat = (mask?: Mask) => {
    setTimeout(() => {
      if (chatStore.newSession(mask) !== false) {
        navigate(Path.Chat);
      }
    }, 10);
  };

  useCommand({
    mask: (id) => {
      try {
        const mask = maskStore.get(id) ?? BUILTIN_MASK_STORE.get(id);
        startChat(mask ?? undefined);
      } catch {
        console.error("[New Chat] failed to create chat from mask id=", id);
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
          onClick={() => navigate(Path.Masks)}
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
        {masks.map((mask) => (
          <MaskItem
            key={mask.id}
            mask={mask}
            detailed
            onClick={() => startChat(mask)}
          />
        ))}
      </div>
    </div>
  );
}
