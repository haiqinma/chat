import { useNavigate } from "react-router-dom";
import { Path } from "../constant";
import Locale from "../locales";
import { useAccessStore } from "../store/access";
import { useSessionModels, useRouterTokenStatus } from "../utils/hooks";
import { isGeneralTextChatModel } from "../utils/model";
import { getRouterPortalPricingUrl } from "../utils/router-portal";
import styles from "./setup-page.module.scss";
import { IconButton } from "./button";
import LeftIcon from "../icons/left.svg";

export function SetupPage() {
  const navigate = useNavigate();
  const accessStore = useAccessStore();
  const availableModels = useSessionModels();
  const hasTextModels = availableModels.some(isGeneralTextChatModel);
  const hasRouterToken = accessStore.selectedRouterToken.trim().length > 0;
  const hasRouterApiKey = accessStore.openaiApiKey.trim().length > 0;
  const routerTokenStatus = useRouterTokenStatus();
  const routerGuidanceTitle =
    !hasRouterToken && !hasRouterApiKey
      ? Locale.NewChat.Router.SetupTitle
      : Locale.NewChat.Router.NoModelTitle;
  const routerGuidanceDescription =
    !hasRouterToken && !hasRouterApiKey
      ? Locale.NewChat.Router.SetupDesc
      : routerTokenStatus.disabled
        ? Locale.NewChat.Router.DisabledDesc
        : routerTokenStatus.expired
          ? Locale.NewChat.Router.ExpiredDesc
          : routerTokenStatus.depleted
            ? Locale.NewChat.Router.DepletedDesc
            : Locale.NewChat.Router.NoModelDesc;

  return (
    <div className={styles["setup-page"]}>
      <div className={styles["setup-header"]}>
        <IconButton
          icon={<LeftIcon />}
          text={Locale.NewChat.Return}
          onClick={() => navigate(Path.Home)}
        />
      </div>

      <div>
        <div className={styles["setup-title"]}>{Locale.Setup.Title}</div>
        <div className={styles["setup-subtitle"]}>{Locale.Setup.SubTitle}</div>
      </div>

      <div className={styles["setup-band"]}>
        <div className={styles["setup-band-title"]}>{routerGuidanceTitle}</div>
        <div className={styles["setup-band-desc"]}>
          {routerGuidanceDescription}
        </div>
        <div className={styles["setup-actions"]}>
          <button
            type="button"
            className={styles["setup-primary"]}
            onClick={() => window.open(getRouterPortalPricingUrl(), "_blank")}
          >
            {Locale.Setup.Purchase}
          </button>
          <button
            type="button"
            className={styles["setup-secondary"]}
            onClick={() =>
              navigate(
                `${Path.Router}?redirect=${encodeURIComponent(Path.Setup)}&action=token`,
              )
            }
          >
            {Locale.Setup.OpenCommunityRouter}
          </button>
        </div>
      </div>
    </div>
  );
}
