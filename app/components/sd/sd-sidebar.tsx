import { IconButton } from "@/app/components/button";
import SDIcon from "@/app/icons/sd.svg";
import ReturnIcon from "@/app/icons/return.svg";
import styles from "./sd-sidebar.module.scss";
import Locale from "@/app/locales";

import { Path } from "@/app/constant";

import { useNavigate } from "react-router-dom";
import dynamic from "next/dynamic";
import {
  SideBarContainer,
  SideBarBody,
  SideBarHeader,
  useDragSideBar,
  useHotKey,
} from "@/app/components/sidebar";

import { getParams, getModelParamBasicData } from "./sd-panel";
import { useSdStore } from "@/app/store/sd";
import { showToast } from "@/app/components/ui-lib";
import { useMobileScreen } from "@/app/utils";

const SdPanel = dynamic(
  async () => (await import("@/app/components/sd")).SdPanel,
  {
    loading: () => null,
  },
);

export function SideBar(props: { className?: string }) {
  useHotKey();
  const isMobileScreen = useMobileScreen();
  const { onDragStart, shouldNarrow } = useDragSideBar();
  const navigate = useNavigate();
  const sdStore = useSdStore();
  const currentMode = sdStore.currentMode;
  const editSourceType = sdStore.editSourceType;
  const editSourceImage = sdStore.editSourceImage;
  const editMaskImage = sdStore.editMaskImage;
  const currentModel = sdStore.currentModel;
  const params = sdStore.currentParams;
  const setParams = sdStore.setCurrentParams;
  const paramColumns = getParams?.(currentModel, params) || [];
  const hasModelSelection = !!currentModel.value && paramColumns.length > 0;
  const canSubmit =
    hasModelSelection &&
    (currentMode !== "editing" || Boolean(editSourceImage));
  const footerSummary =
    currentMode === "editing"
      ? editSourceImage
        ? editMaskImage
          ? Locale.SdPanel.SubmitSummaryReady
          : Locale.SdPanel.SubmitSummaryNoMask
        : Locale.Sd.SelectImageFirst
      : Locale.SdPanel.SubmitSummaryGenerate;

  const handleSubmit = () => {
    const columns = getParams?.(currentModel, params);
    if (!currentModel.value || columns.length === 0) {
      showToast(Locale.Sd.EmptyRecord);
      return;
    }
    if (currentMode === "editing" && !editSourceImage) {
      showToast(Locale.Sd.SelectImageFirst);
      return;
    }
    const reqParams: any = {};
    for (let i = 0; i < columns.length; i++) {
      const item = columns[i];
      reqParams[item.value] = params[item.value] ?? null;
      if (item.required) {
        if (!reqParams[item.value]) {
          showToast(Locale.SdPanel.ParamIsRequired(item.name));
          return;
        }
      }
    }
    let data: any = {
      provider: currentModel.provider || "",
      provider_name: currentModel.providerName || "",
      endpoint_type: currentModel.endpointType || "",
      model_def: currentModel,
      model: currentModel.value,
      model_name: currentModel.name,
      status: "wait",
      source_image: currentMode === "editing" ? editSourceImage : "",
      mask_image: currentMode === "editing" ? editMaskImage : "",
      params: reqParams,
      created_at: new Date().toLocaleString(),
      img_data: "",
    };
    sdStore.sendTask(data, () => {
      setParams(getModelParamBasicData(columns, params, true));
      navigate(Path.Sd);
    });
  };

  return (
    <SideBarContainer
      onDragStart={onDragStart}
      shouldNarrow={shouldNarrow}
      {...props}
    >
      {isMobileScreen ? (
        <div
          className="window-header"
          data-tauri-drag-region
          style={{
            paddingLeft: 0,
            paddingRight: 0,
          }}
        >
          <div className="window-actions">
            <div className="window-action-button">
              <IconButton
                icon={<ReturnIcon />}
                bordered
                title={Locale.Sd.Actions.ReturnHome}
                onClick={() => navigate(Path.Home)}
              />
            </div>
          </div>
          <SDIcon width={50} height={50} />
          <div className="window-actions">
            <div className="window-action-button"></div>
          </div>
        </div>
      ) : (
        <SideBarHeader
          title={Locale.Sd.Title}
          logo={<SDIcon width={38} height={"100%"} />}
          extra={
            <IconButton
              icon={<ReturnIcon />}
              bordered
              title={Locale.Sd.Actions.ReturnHome}
              onClick={() => navigate(Path.Home)}
            />
          }
        ></SideBarHeader>
      )}
      <SideBarBody>
        <SdPanel />
      </SideBarBody>
      <div className={styles["sidebar-tail"]}>
        <div className={styles["submit-card"]}>
          <div className={styles["submit-card-header"]}>
            <div className={styles["submit-card-title"]}>
              {Locale.SdPanel.Submit}
            </div>
          </div>
          <div className={styles["submit-card-summary"]}>{footerSummary}</div>
          <div className={styles["submit-card-meta"]}>
            {currentModel.name && (
              <span className={styles["submit-card-chip"]}>
                {currentModel.name}
              </span>
            )}
            {currentMode === "editing" && editSourceImage && (
              <span className={styles["submit-card-chip"]}>
                {editSourceType === "history"
                  ? Locale.SdPanel.SourceTypes.History
                  : Locale.SdPanel.SourceTypes.Upload}
              </span>
            )}
            {currentMode === "editing" && editMaskImage && (
              <span className={styles["submit-card-chip"]}>
                {Locale.SdPanel.MaskImage}
              </span>
            )}
          </div>
          <IconButton
            text={Locale.SdPanel.Submit}
            type="primary"
            shadow
            className={styles["submit-primary"]}
            disabled={!canSubmit}
            onClick={handleSubmit}
          ></IconButton>
        </div>
      </div>
    </SideBarContainer>
  );
}
