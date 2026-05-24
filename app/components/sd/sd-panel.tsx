import styles from "./sd-panel.module.scss";
import React from "react";
import { Select } from "@/app/components/ui-lib";
import Locale from "@/app/locales";
import { useSdStore } from "@/app/store/sd";
import clsx from "clsx";
import { useAllModels } from "@/app/utils/hooks";
import { resolveImageModels } from "./image-registry";
import { ImageFormMode } from "./image-endpoint-schemas";

export function ControlParamItem(props: {
  title: string;
  subTitle?: string;
  required?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx(styles["ctrl-param-item"], props.className)}>
      <div className={styles["ctrl-param-item-header"]}>
        <div className={styles["ctrl-param-item-title"]}>
          <div>
            {props.title}
            {props.required && <span style={{ color: "red" }}>*</span>}
          </div>
        </div>
      </div>
      {props.children}
      {props.subTitle && (
        <div className={styles["ctrl-param-item-sub-title"]}>
          {props.subTitle}
        </div>
      )}
    </div>
  );
}

export function ControlParam(props: {
  columns: any[];
  data: any;
  onChange: (field: string, val: any) => void;
}) {
  return (
    <>
      {props.columns?.map((item) => {
        let element: null | React.ReactNode;
        switch (item.type) {
          case "textarea":
            element = (
              <ControlParamItem
                title={item.name}
                subTitle={item.sub}
                required={item.required}
              >
                <textarea
                  rows={item.rows || 3}
                  style={{ maxWidth: "100%", width: "100%", padding: "10px" }}
                  placeholder={item.placeholder}
                  onChange={(e) => {
                    props.onChange(item.value, e.currentTarget.value);
                  }}
                  value={props.data[item.value]}
                ></textarea>
              </ControlParamItem>
            );
            break;
          case "select":
            element = (
              <ControlParamItem
                title={item.name}
                subTitle={item.sub}
                required={item.required}
              >
                <Select
                  aria-label={item.name}
                  value={props.data[item.value]}
                  onChange={(e) => {
                    props.onChange(item.value, e.currentTarget.value);
                  }}
                >
                  {item.options.map((opt: any) => {
                    return (
                      <option value={opt.value} key={opt.value}>
                        {opt.name}
                      </option>
                    );
                  })}
                </Select>
              </ControlParamItem>
            );
            break;
          case "number":
            element = (
              <ControlParamItem
                title={item.name}
                subTitle={item.sub}
                required={item.required}
              >
                <input
                  aria-label={item.name}
                  type="number"
                  min={item.min}
                  max={item.max}
                  value={props.data[item.value] || 0}
                  onChange={(e) => {
                    props.onChange(item.value, parseInt(e.currentTarget.value));
                  }}
                />
              </ControlParamItem>
            );
            break;
          default:
            element = (
              <ControlParamItem
                title={item.name}
                subTitle={item.sub}
                required={item.required}
              >
                <input
                  aria-label={item.name}
                  type="text"
                  value={props.data[item.value]}
                  style={{ maxWidth: "100%", width: "100%" }}
                  onChange={(e) => {
                    props.onChange(item.value, e.currentTarget.value);
                  }}
                />
              </ControlParamItem>
            );
        }
        return <div key={item.value}>{element}</div>;
      })}
    </>
  );
}

export const getModelParamBasicData = (
  columns: any[],
  data: any,
  clearText?: boolean,
) => {
  const newParams: any = {};
  columns.forEach((item: any) => {
    if (clearText && ["text", "textarea", "number"].includes(item.type)) {
      newParams[item.value] = item.default || "";
    } else {
      // @ts-ignore
      newParams[item.value] = data[item.value] || item.default || "";
    }
  });
  return newParams;
};

export const getParams = (model: any, params: any) => {
  return model?.params?.(params) || [];
};

export function SdPanel() {
  const sdStore = useSdStore();
  const runtimeModels = useAllModels();
  const currentMode = sdStore.currentMode;
  const setCurrentMode = sdStore.setCurrentMode;
  const editSourceType = sdStore.editSourceType;
  const setEditSourceType = sdStore.setEditSourceType;
  const editSourceImage = sdStore.editSourceImage;
  const editSourceName = sdStore.editSourceName;
  const setEditSourceImage = sdStore.setEditSourceImage;
  const currentModel = sdStore.currentModel;
  const setCurrentModel = sdStore.setCurrentModel;
  const params = sdStore.currentParams;
  const setParams = sdStore.setCurrentParams;
  const successfulImages = React.useMemo(
    () =>
      sdStore.draw
        .filter((item: any) => item.status === "success" && !!item.img_data)
        .map((item: any) => ({
          value: item.id,
          name: `${item.model_name} · ${item.created_at}`,
          image: item.img_data,
        })),
    [sdStore.draw],
  );
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const imageModels = React.useMemo(
    () => resolveImageModels(runtimeModels, currentMode),
    [runtimeModels, currentMode],
  );
  const hasImageModels = imageModels.length > 0;

  React.useEffect(() => {
    if (imageModels.length === 0) return;
    const matched = imageModels.find(
      (item) => item.value === currentModel.value,
    );
    if (matched && matched !== currentModel) {
      setCurrentModel(matched);
      return;
    }
    if (!matched) {
      const fallbackModel = imageModels[0];
      setCurrentModel(fallbackModel);
      setParams(getModelParamBasicData(fallbackModel.params({}), {}));
    }
  }, [currentModel, imageModels, setCurrentModel, setParams]);

  const handleValueChange = (field: string, val: any) => {
    setParams({
      ...params,
      [field]: val,
    });
  };
  const handleModelChange = (model: any) => {
    setCurrentModel(model);
    setParams(getModelParamBasicData(model.params({}), params));
  };
  const handleModeChange = (mode: ImageFormMode) => {
    setCurrentMode(mode);
  };
  const handleUploadImage = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setEditSourceImage(reader.result, file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
      <ControlParamItem title={Locale.SdPanel.Mode}>
        <Select
          aria-label={Locale.SdPanel.Mode}
          value={currentMode}
          onChange={(e) =>
            handleModeChange(e.currentTarget.value as ImageFormMode)
          }
        >
          <option value="generation">{Locale.SdPanel.Modes.Generation}</option>
          <option value="editing">{Locale.SdPanel.Modes.Editing}</option>
        </Select>
      </ControlParamItem>
      <ControlParamItem title={Locale.SdPanel.AIModel}>
        <Select
          aria-label={Locale.SdPanel.AIModel}
          value={currentModel.value}
          disabled={!hasImageModels}
          onChange={(e) => {
            const model = imageModels.find(
              (item) => item.value === e.currentTarget.value,
            );
            if (model) {
              handleModelChange(model);
            }
          }}
        >
          {hasImageModels ? (
            imageModels.map((item) => (
              <option value={item.value} key={item.value}>
                {item.name}
              </option>
            ))
          ) : (
            <option value="">{Locale.Sd.EmptyRecord}</option>
          )}
        </Select>
      </ControlParamItem>
      {currentMode === "editing" && (
        <ControlParamItem title={Locale.SdPanel.SourceType}>
          <Select
            aria-label={Locale.SdPanel.SourceType}
            value={editSourceType}
            onChange={(e) =>
              setEditSourceType(e.currentTarget.value as "history" | "upload")
            }
          >
            <option value="history">
              {Locale.SdPanel.SourceTypes.History}
            </option>
            <option value="upload">{Locale.SdPanel.SourceTypes.Upload}</option>
          </Select>
        </ControlParamItem>
      )}
      {currentMode === "editing" && editSourceType === "history" && (
        <ControlParamItem title={Locale.SdPanel.SelectHistory}>
          <Select
            aria-label={Locale.SdPanel.SelectHistory}
            value={
              successfulImages.find((item) => item.image === editSourceImage)
                ?.value || ""
            }
            onChange={(e) => {
              const selected = successfulImages.find(
                (item) => item.value === e.currentTarget.value,
              );
              if (selected) {
                setEditSourceImage(selected.image, selected.name);
              }
            }}
          >
            <option value="">{Locale.Sd.SelectImageFirst}</option>
            {successfulImages.map((item) => (
              <option key={item.value} value={item.value}>
                {item.name}
              </option>
            ))}
          </Select>
        </ControlParamItem>
      )}
      {currentMode === "editing" && editSourceType === "upload" && (
        <ControlParamItem title={Locale.SdPanel.UploadImage}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleUploadImage(e.target.files?.[0])}
          />
        </ControlParamItem>
      )}
      {currentMode === "editing" && editSourceImage && (
        <ControlParamItem title={editSourceName || Locale.SdPanel.UploadImage}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={editSourceImage}
            alt={editSourceName || "edit-source"}
            style={{
              width: "100%",
              maxHeight: 180,
              objectFit: "contain",
              borderRadius: 8,
              border: "var(--border-in-light)",
            }}
          />
        </ControlParamItem>
      )}
      {hasImageModels && (
        <ControlParamItem title={Locale.Sd.SourceLabel}>
          <div>{currentModel.providerName || currentModel.provider || "-"}</div>
          <div className={styles["ctrl-param-item-sub-title"]}>
            {Locale.Sd.EndpointLabel}:{" "}
            {currentMode === "editing"
              ? "/v1/images/edits"
              : "/v1/images/generations"}
          </div>
        </ControlParamItem>
      )}
      {!hasImageModels && (
        <ControlParamItem title={Locale.Sd.NoModelsTitle}>
          <div className={styles["ctrl-param-item-sub-title"]}>
            {Locale.Sd.NoModelsDesc}
          </div>
        </ControlParamItem>
      )}
      {hasImageModels && (
        <ControlParam
          columns={getParams?.(currentModel, params) as any[]}
          data={params}
          onChange={handleValueChange}
        ></ControlParam>
      )}
    </>
  );
}
