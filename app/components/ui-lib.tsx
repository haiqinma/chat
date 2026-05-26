/* eslint-disable @next/next/no-img-element */
import styles from "./ui-lib.module.scss";
import LoadingIcon from "../icons/three-dots.svg";
import CloseIcon from "../icons/close.svg";
import EyeIcon from "../icons/eye.svg";
import EyeOffIcon from "../icons/eye-off.svg";
import DownIcon from "../icons/down.svg";
import ConfirmIcon from "../icons/confirm.svg";
import CancelIcon from "../icons/cancel.svg";
import MaxIcon from "../icons/max.svg";
import MinIcon from "../icons/min.svg";
import DownloadIcon from "../icons/download.svg";
import ZoomIcon from "../icons/zoom.svg";

import Locale from "../locales";
import { isDesktopAppRuntime, saveWithDialog, writeFile } from "../tauri";

import { createRoot } from "react-dom/client";
import React, {
  CSSProperties,
  HTMLProps,
  MouseEvent,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { IconButton } from "./button";
import { Avatar } from "./emoji";
import clsx from "clsx";

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 3.333v9.334M3.333 8h9.334"
        stroke="currentColor"
        strokeWidth="1.333"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M3.333 8h9.334"
        stroke="currentColor"
        strokeWidth="1.333"
        strokeLinecap="round"
      />
    </svg>
  );
}

function getImageFileExtension(blob: Blob, src: string) {
  const mimeExtension = blob.type.split("/")[1]?.split("+")[0];
  if (mimeExtension) return mimeExtension === "jpeg" ? "jpg" : mimeExtension;

  try {
    const pathname = new URL(src).pathname;
    const extension = pathname.split(".").pop();
    if (extension && extension.length <= 5) return extension;
  } catch {
    // Ignore non-URL sources such as data URLs.
  }

  return "png";
}

async function getImageBlob(src: string) {
  if (src.startsWith("data:")) {
    const response = await fetch(src);
    return await response.blob();
  }

  const response = await fetch(src);
  if (!response.ok)
    throw new Error(`Image download failed: ${response.status}`);
  return await response.blob();
}

async function downloadImage(src: string) {
  try {
    const blob = await getImageBlob(src);
    const extension = getImageFileExtension(blob, src);
    const filename = `image-${Date.now()}.${extension}`;

    if (isDesktopAppRuntime()) {
      const path = await saveWithDialog({
        defaultPath: filename,
        filters: [
          {
            name: `${extension.toUpperCase()} Image`,
            extensions: [extension],
          },
          {
            name: "All Files",
            extensions: ["*"],
          },
        ],
      });

      if (!path) return;

      await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
      showToast(Locale.Download.Success);
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    const element = document.createElement("a");
    element.href = objectUrl;
    element.download = filename;
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    element.remove();
    URL.revokeObjectURL(objectUrl);
    showToast(Locale.Download.Success);
  } catch {
    try {
      const element = document.createElement("a");
      element.href = src;
      element.download = `image-${Date.now()}.png`;
      element.target = "_blank";
      element.rel = "noopener noreferrer";
      element.style.display = "none";
      document.body.appendChild(element);
      element.click();
      element.remove();
    } catch {
      showToast(Locale.Download.Failed);
    }
  }
}

export function Popover(props: {
  children: React.ReactNode;
  content: React.ReactNode;
  open?: boolean;
  onClose?: () => void;
}) {
  return (
    <div className={styles.popover}>
      {props.children}
      {props.open && (
        <div className={styles["popover-mask"]} onClick={props.onClose}></div>
      )}
      {props.open && (
        <div className={styles["popover-content"]}>{props.content}</div>
      )}
    </div>
  );
}

export function Card(props: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx(styles.card, props.className)}>{props.children}</div>
  );
}

export function ListItem(props: {
  title?: string;
  subTitle?: React.ReactNode;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  onClick?: (e: MouseEvent) => void;
  vertical?: boolean;
}) {
  return (
    <div
      className={clsx(
        styles["list-item"],
        {
          [styles["vertical"]]: props.vertical,
        },
        props.className,
      )}
      onClick={props.onClick}
    >
      <div className={styles["list-header"]}>
        {props.icon && <div className={styles["list-icon"]}>{props.icon}</div>}
        <div className={styles["list-item-title"]}>
          <div>{props.title}</div>
          {props.subTitle && (
            <div className={styles["list-item-sub-title"]}>
              {props.subTitle}
            </div>
          )}
        </div>
      </div>
      {props.children}
    </div>
  );
}

export function List(props: { children: React.ReactNode; id?: string }) {
  return (
    <div className={styles.list} id={props.id}>
      {props.children}
    </div>
  );
}

export function Loading() {
  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <LoadingIcon />
    </div>
  );
}

interface ModalProps {
  title: string;
  children?: any;
  actions?: React.ReactNode[];
  defaultMax?: boolean;
  footer?: React.ReactNode;
  onClose?: () => void | boolean | Promise<void | boolean>;
}
export function Modal(props: ModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        void props.onClose?.();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [isMax, setMax] = useState(!!props.defaultMax);

  return (
    <div
      className={clsx(styles["modal-container"], {
        [styles["modal-container-max"]]: isMax,
      })}
    >
      <div className={styles["modal-header"]}>
        <div className={styles["modal-title"]}>{props.title}</div>

        <div className={styles["modal-header-actions"]}>
          <div
            className={styles["modal-header-action"]}
            onClick={() => setMax(!isMax)}
          >
            {isMax ? <MinIcon /> : <MaxIcon />}
          </div>
          <div
            className={styles["modal-header-action"]}
            onClick={() => void props.onClose?.()}
          >
            <CloseIcon />
          </div>
        </div>
      </div>

      <div className={styles["modal-content"]}>{props.children}</div>

      <div className={styles["modal-footer"]}>
        {props.footer}
        <div className={styles["modal-actions"]}>
          {props.actions?.map((action, i) => (
            <div key={i} className={styles["modal-action"]}>
              {action}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function showModal(props: ModalProps) {
  const div = document.createElement("div");
  div.className = "modal-mask";
  document.body.appendChild(div);

  const root = createRoot(div);
  const closeModal = async () => {
    const result = await props.onClose?.();
    if (result === false) return;
    root.unmount();
    div.remove();
  };

  div.onclick = (e) => {
    if (e.target === div) {
      void closeModal();
    }
  };

  root.render(<Modal {...props} onClose={closeModal}></Modal>);

  return closeModal;
}

export type ToastProps = {
  content: string;
  action?: {
    text: string;
    onClick: () => void;
  };
  onClose?: () => void;
};

export function Toast(props: ToastProps) {
  return (
    <div className={styles["toast-container"]}>
      <div className={styles["toast-content"]}>
        <span>{props.content}</span>
        {props.action && (
          <button
            onClick={() => {
              props.action?.onClick?.();
              props.onClose?.();
            }}
            className={styles["toast-action"]}
          >
            {props.action.text}
          </button>
        )}
      </div>
    </div>
  );
}

export function showToast(
  content: string,
  action?: ToastProps["action"],
  delay = 3000,
) {
  const div = document.createElement("div");
  div.className = styles.show;
  document.body.appendChild(div);

  const root = createRoot(div);
  const close = () => {
    div.classList.add(styles.hide);

    setTimeout(() => {
      root.unmount();
      div.remove();
    }, 300);
  };

  setTimeout(() => {
    close();
  }, delay);

  root.render(<Toast content={content} action={action} onClose={close} />);
}

export type InputProps = React.HTMLProps<HTMLTextAreaElement> & {
  autoHeight?: boolean;
  rows?: number;
};

export function Input(props: InputProps) {
  return (
    <textarea
      {...props}
      className={clsx(styles["input"], props.className)}
    ></textarea>
  );
}

export function PasswordInput(
  props: HTMLProps<HTMLInputElement> & { aria?: string },
) {
  const { aria, ...inputProps } = props;
  const [visible, setVisible] = useState(false);
  function changeVisibility() {
    setVisible(!visible);
  }

  return (
    <div className={"password-input-container"}>
      <IconButton
        aria={aria}
        icon={visible ? <EyeIcon /> : <EyeOffIcon />}
        onClick={changeVisibility}
        className={"password-eye"}
      />
      <input
        {...inputProps}
        type={visible ? "text" : "password"}
        className={"password-input"}
      />
    </div>
  );
}

export function Select(
  props: React.DetailedHTMLProps<
    React.SelectHTMLAttributes<HTMLSelectElement> & {
      align?: "left" | "center";
    },
    HTMLSelectElement
  >,
) {
  const { className, children, align, ...otherProps } = props;
  return (
    <div
      className={clsx(
        styles["select-with-icon"],
        {
          [styles["left-align-option"]]: align === "left",
        },
        className,
      )}
    >
      <select className={styles["select-with-icon-select"]} {...otherProps}>
        {children}
      </select>
      <DownIcon className={styles["select-with-icon-icon"]} />
    </div>
  );
}

export function showConfirm(content: any) {
  const div = document.createElement("div");
  div.className = "modal-mask";
  document.body.appendChild(div);

  const root = createRoot(div);
  const closeModal = () => {
    root.unmount();
    div.remove();
  };

  return new Promise<boolean>((resolve) => {
    root.render(
      <Modal
        title={Locale.UI.Confirm}
        actions={[
          <IconButton
            key="cancel"
            text={Locale.UI.Cancel}
            onClick={() => {
              resolve(false);
              closeModal();
            }}
            icon={<CancelIcon />}
            tabIndex={0}
            bordered
            shadow
          ></IconButton>,
          <IconButton
            key="confirm"
            text={Locale.UI.Confirm}
            type="primary"
            onClick={() => {
              resolve(true);
              closeModal();
            }}
            icon={<ConfirmIcon />}
            tabIndex={0}
            autoFocus
            bordered
            shadow
          ></IconButton>,
        ]}
        onClose={closeModal}
      >
        {content}
      </Modal>,
    );
  });
}

function PromptInput(props: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  const [input, setInput] = useState(props.value);
  const onInput = (value: string) => {
    props.onChange(value);
    setInput(value);
  };

  return (
    <textarea
      className={styles["modal-input"]}
      autoFocus
      value={input}
      onInput={(e) => onInput(e.currentTarget.value)}
      rows={props.rows ?? 3}
    ></textarea>
  );
}

export function showPrompt(content: any, value = "", rows = 3) {
  const div = document.createElement("div");
  div.className = "modal-mask";
  document.body.appendChild(div);

  const root = createRoot(div);
  const closeModal = () => {
    root.unmount();
    div.remove();
  };

  return new Promise<string>((resolve) => {
    let userInput = value;

    root.render(
      <Modal
        title={content}
        actions={[
          <IconButton
            key="cancel"
            text={Locale.UI.Cancel}
            onClick={() => {
              closeModal();
            }}
            icon={<CancelIcon />}
            bordered
            shadow
            tabIndex={0}
          ></IconButton>,
          <IconButton
            key="confirm"
            text={Locale.UI.Confirm}
            type="primary"
            onClick={() => {
              resolve(userInput);
              closeModal();
            }}
            icon={<ConfirmIcon />}
            bordered
            shadow
            tabIndex={0}
          ></IconButton>,
        ]}
        onClose={closeModal}
      >
        <PromptInput
          onChange={(val) => (userInput = val)}
          value={value}
          rows={rows}
        ></PromptInput>
      </Modal>,
    );
  });
}

export function showImageModal(
  img: string,
  defaultMax?: boolean,
  style?: CSSProperties,
  boxStyle?: CSSProperties,
) {
  showModal({
    title: Locale.Export.Image.Modal,
    defaultMax: defaultMax,
    children: <ImagePreview img={img} style={style} boxStyle={boxStyle} />,
  });
}

function ImagePreview(props: {
  img: string;
  style?: CSSProperties;
  boxStyle?: CSSProperties;
}) {
  const [zoom, setZoom] = useState(1);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const boxRef = useRef<HTMLDivElement | null>(null);
  const hasManualZoomRef = useRef(false);
  const updateZoom = useCallback((nextZoom: number) => {
    setZoom(Math.min(5, Math.max(0.25, Number(nextZoom.toFixed(2)))));
  }, []);

  const fitToViewport = useCallback(() => {
    const box = boxRef.current;
    if (!box || naturalSize.width <= 0 || naturalSize.height <= 0) return;
    const nextZoom = Math.min(
      box.clientWidth / naturalSize.width,
      box.clientHeight / naturalSize.height,
      1,
    );
    setZoom(Math.min(5, Math.max(0.25, Number(nextZoom.toFixed(2)))));
  }, [naturalSize.height, naturalSize.width]);

  useEffect(() => {
    if (naturalSize.width <= 0 || naturalSize.height <= 0) return;
    fitToViewport();
  }, [fitToViewport, naturalSize.height, naturalSize.width]);

  useEffect(() => {
    const handleResize = () => {
      if (hasManualZoomRef.current) return;
      fitToViewport();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [fitToViewport]);

  const imageWidth =
    naturalSize.width > 0 ? naturalSize.width * zoom : undefined;
  const imageHeight =
    naturalSize.height > 0 ? naturalSize.height * zoom : undefined;

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <IconButton
            icon={<DownloadIcon />}
            text={Locale.Export.Download}
            bordered
            onClick={() => void downloadImage(props.img)}
          />
          <IconButton
            icon={<PlusIcon />}
            bordered
            title="Zoom in"
            aria="Zoom in"
            onClick={() => {
              hasManualZoomRef.current = true;
              updateZoom(zoom + 0.25);
            }}
          />
          <IconButton
            icon={<MinusIcon />}
            bordered
            title="Zoom out"
            aria="Zoom out"
            onClick={() => {
              hasManualZoomRef.current = true;
              updateZoom(zoom - 0.25);
            }}
          />
          <IconButton
            icon={<ZoomIcon />}
            text={`${Math.round(zoom * 100)}%`}
            bordered
            title="Actual size"
            onClick={() => {
              hasManualZoomRef.current = true;
              updateZoom(1);
            }}
          />
        </div>
      </div>

      <div
        ref={boxRef}
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          overflow: "auto",
          minHeight: 0,
          flex: 1,
          ...props.boxStyle,
        }}
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          hasManualZoomRef.current = true;
          updateZoom(zoom + (e.deltaY < 0 ? 0.1 : -0.1));
        }}
      >
        <img
          src={props.img}
          alt="preview"
          draggable={false}
          onLoad={(e) => {
            setNaturalSize({
              width: e.currentTarget.naturalWidth,
              height: e.currentTarget.naturalHeight,
            });
          }}
          style={{
            ...props.style,
            width: imageWidth,
            height: imageHeight,
            maxWidth: "none",
            maxHeight: "none",
            objectFit: "contain",
            transition: "width 0.12s ease, height 0.12s ease",
          }}
        ></img>
      </div>
    </div>
  );
}

export function Selector<T>(props: {
  items: Array<{
    title: string;
    subTitle?: string;
    value: T;
    disable?: boolean;
  }>;
  defaultSelectedValue?: T[] | T;
  onSelection?: (selection: T[]) => void;
  onClose?: () => void;
  multiple?: boolean;
}) {
  const [selectedValues, setSelectedValues] = useState<T[]>(
    Array.isArray(props.defaultSelectedValue)
      ? props.defaultSelectedValue
      : props.defaultSelectedValue !== undefined
        ? [props.defaultSelectedValue]
        : [],
  );

  const handleSelection = (e: MouseEvent, value: T) => {
    if (props.multiple) {
      e.stopPropagation();
      const newSelectedValues = selectedValues.includes(value)
        ? selectedValues.filter((v) => v !== value)
        : [...selectedValues, value];
      setSelectedValues(newSelectedValues);
      props.onSelection?.(newSelectedValues);
    } else {
      setSelectedValues([value]);
      props.onSelection?.([value]);
      props.onClose?.();
    }
  };

  return (
    <div className={styles["selector"]} onClick={() => props.onClose?.()}>
      <div className={styles["selector-content"]}>
        <List>
          {props.items.map((item, i) => {
            const selected = selectedValues.includes(item.value);
            return (
              <ListItem
                className={clsx(styles["selector-item"], {
                  [styles["selector-item-disabled"]]: item.disable,
                })}
                key={i}
                title={item.title}
                subTitle={item.subTitle}
                icon={<Avatar model={item.value as string} />}
                onClick={(e) => {
                  if (item.disable) {
                    e.stopPropagation();
                  } else {
                    handleSelection(e, item.value);
                  }
                }}
              >
                {selected ? (
                  <div
                    style={{
                      height: 10,
                      width: 10,
                      backgroundColor: "var(--primary)",
                      borderRadius: 10,
                    }}
                  ></div>
                ) : (
                  <></>
                )}
              </ListItem>
            );
          })}
        </List>
      </div>
    </div>
  );
}
export function FullScreen(props: any) {
  const { children, right = 10, top = 10, ...rest } = props;
  const ref = useRef<HTMLDivElement | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      ref.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);
  useEffect(() => {
    const handleScreenChange = (e: any) => {
      if (e.target === ref.current) {
        setFullScreen(!!document.fullscreenElement);
      }
    };
    document.addEventListener("fullscreenchange", handleScreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleScreenChange);
    };
  }, []);
  return (
    <div ref={ref} style={{ position: "relative" }} {...rest}>
      <div style={{ position: "absolute", right, top }}>
        <IconButton
          icon={fullScreen ? <MinIcon /> : <MaxIcon />}
          onClick={toggleFullscreen}
          bordered
        />
      </div>
      {children}
    </div>
  );
}
