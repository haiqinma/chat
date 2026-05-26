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

import { DEFAULT_MASK_AVATAR, Mask, useMaskStore } from "../store/mask";
import {
  ChatMessage,
  createMessage,
  ModelConfig,
  ModelType,
  useAppConfig,
  useChatStore,
} from "../store";
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
import { useNavigate } from "react-router-dom";

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
import { BUILTIN_MASK_STORE } from "../masks";
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

export function MaskAvatar(props: { avatar: string; model?: ModelType }) {
  const config = useAppConfig();
  const model = props.model || config.modelConfig.model;
  const useEmoji =
    props.avatar &&
    props.avatar !== DEFAULT_MASK_AVATAR &&
    isEmojiUnified(props.avatar);

  return useEmoji ? <Avatar avatar={props.avatar} /> : <Avatar model={model} />;
}

export function MaskConfig(props: {
  mask: Mask;
  updateMask: Updater<Mask>;
  extraListItems?: ReactNode;
  readonly?: boolean;
  shouldSyncFromGlobal?: boolean;
  modelOptions?: LLMModel[];
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [showCandidateModelSelector, setShowCandidateModelSelector] =
    useState(false);
  const maskProviderModels = useMaskProviderModels();
  const selectedCandidateModels = useMemo(
    () => normalizeModelCandidates(props.mask.candidateModels),
    [props.mask.candidateModels],
  );
  const selectedCandidateValues = useMemo(
    () =>
      selectedCandidateModels.map((candidate) =>
        buildModelCandidateValue(candidate),
      ),
    [selectedCandidateModels],
  );
  const baseModelOptions = props.modelOptions ?? maskProviderModels;
  const maskModelOptions = useMemo(() => {
    if (selectedCandidateModels.length === 0) {
      return baseModelOptions;
    }
    return filterModelsByCandidates(baseModelOptions, selectedCandidateModels);
  }, [baseModelOptions, selectedCandidateModels]);
  const candidateModelSummary =
    maskProviderModels.length === 0
      ? Locale.SearchChat.Page.Loading
      : selectedCandidateModels.length === 0
        ? "No restriction"
        : `${selectedCandidateModels.length} models selected`;
  const candidateModelSelectorItems = useMemo(
    () =>
      maskProviderModels.map((model) => ({
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
    [maskProviderModels],
  );

  const readonlyContextMarkdown = props.mask.context
    .map((message, index) => {
      const content = getMessageTextContent(message).trim();
      return `### ${index + 1}. ${message.role}\n\n${content || "_empty_"}`;
    })
    .join("\n\n");

  const updateConfig = (updater: (config: ModelConfig) => void) => {
    if (props.readonly) return;

    const config = { ...props.mask.modelConfig };
    updater(config);
    props.updateMask((mask) => {
      mask.modelConfig = config;
      // if user changed current session mask, it will disable auto sync
      mask.syncGlobalConfig = false;
    });
  };

  const copyMaskLink = () => {
    const maskLink = `${location.protocol}//${location.host}/#${Path.NewChat}?mask=${props.mask.id}`;
    copyToClipboard(maskLink);
  };

  const globalConfig = useAppConfig();

  return (
    <>
      {props.readonly ? (
        <List>
          {props.mask.category && (
            <ListItem
              title="Category"
              subTitle={props.mask.category}
              vertical
            />
          )}
          {props.mask.description && (
            <ListItem title="Description" vertical>
              <div className={styles["mask-readonly-section"]}>
                <Markdown content={props.mask.description} />
              </div>
            </ListItem>
          )}
          {!!props.mask.starters?.length && (
            <ListItem title="Recommended Starters" vertical>
              <div className={styles["mask-readonly-section"]}>
                <Markdown
                  content={props.mask.starters
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
          context={props.mask.context}
          updateContext={(updater) => {
            const context = props.mask.context.slice();
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
              <MaskAvatar
                avatar={props.mask.avatar}
                model={props.mask.modelConfig.model}
              />
            </div>
          </Popover>
        </ListItem>
        <ListItem title={Locale.Mask.Config.Name}>
          <input
            aria-label={Locale.Mask.Config.Name}
            type="text"
            value={props.mask.name}
            onInput={(e) =>
              props.updateMask((mask) => {
                mask.name = e.currentTarget.value;
              })
            }
          ></input>
        </ListItem>
        <ListItem
          title="Candidate Models"
          subTitle="Only these models can be used by chat sessions created from this mask"
        >
          <input
            aria-label="Candidate Models"
            type="text"
            readOnly
            value={candidateModelSummary}
            onClick={() => setShowCandidateModelSelector(true)}
          ></input>
        </ListItem>
        <ListItem
          title={Locale.Mask.Config.HideContext.Title}
          subTitle={Locale.Mask.Config.HideContext.SubTitle}
        >
          <input
            aria-label={Locale.Mask.Config.HideContext.Title}
            type="checkbox"
            checked={props.mask.hideContext}
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
              checked={props.mask.enableArtifacts !== false}
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
              checked={props.mask.enableCodeFold !== false}
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
              onClick={copyMaskLink}
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
              checked={props.mask.syncGlobalConfig !== false}
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
          modelConfig={{ ...props.mask.modelConfig }}
          updateConfig={updateConfig}
          modelOptions={maskModelOptions}
          strictModelSelection
        />
        {props.extraListItems}
      </List>
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
    </>
  );
}

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

export function MaskPage() {
  const navigate = useNavigate();

  const maskStore = useMaskStore();
  const chatStore = useChatStore();

  const filterLang = maskStore.language;

  const allMasks = maskStore
    .getAll()
    .filter((m) => !filterLang || m.lang === filterLang);

  const [searchText, setSearchText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const categories = useMemo(
    () =>
      Array.from(
        new Set(allMasks.map((m) => m.category).filter(Boolean) as string[]),
      ),
    [allMasks],
  );
  useEffect(() => {
    if (selectedCategory && !categories.includes(selectedCategory)) {
      setSelectedCategory("");
    }
  }, [categories, selectedCategory]);
  const masks = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return allMasks.filter((m) => {
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
  }, [allMasks, searchText, selectedCategory]);

  const [editingMaskId, setEditingMaskId] = useState<string | undefined>();
  const editingMask =
    maskStore.get(editingMaskId) ?? BUILTIN_MASK_STORE.get(editingMaskId);
  const closeMaskModal = () => setEditingMaskId(undefined);

  const downloadAll = () => {
    downloadAs(JSON.stringify(masks.filter((v) => !v.builtin)), FileName.Masks);
  };

  const importFromFile = () => {
    readFromFile().then((content) => {
      try {
        const importMasks = JSON.parse(content);
        if (Array.isArray(importMasks)) {
          for (const mask of importMasks) {
            if (mask.name) {
              maskStore.create(mask);
            }
          }
          return;
        }
        //if the content is a single mask.
        if (importMasks.name) {
          maskStore.create(importMasks);
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
              {Locale.Mask.Page.SubTitle(allMasks.length)}
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
                  maskStore.setLanguage(undefined);
                } else {
                  maskStore.setLanguage(value as Lang);
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
                const createdMask = maskStore.create();
                setEditingMaskId(createdMask.id);
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
            {masks.map((m) => (
              <div className={styles["mask-item"]} key={m.id}>
                <div className={styles["mask-header"]}>
                  <div className={styles["mask-icon"]}>
                    <MaskAvatar avatar={m.avatar} model={m.modelConfig.model} />
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
                    onClick={() => {
                      if (chatStore.newSession(m) !== false) {
                        navigate(Path.Chat);
                      }
                    }}
                  />
                  {m.builtin ? (
                    <IconButton
                      icon={<EyeIcon />}
                      text={Locale.Mask.Item.View}
                      onClick={() => setEditingMaskId(m.id)}
                    />
                  ) : (
                    <IconButton
                      icon={<EditIcon />}
                      text={Locale.Mask.Item.Edit}
                      onClick={() => setEditingMaskId(m.id)}
                    />
                  )}
                  {!m.builtin && (
                    <IconButton
                      icon={<DeleteIcon />}
                      text={Locale.Mask.Item.Delete}
                      onClick={async () => {
                        if (await showConfirm(Locale.Mask.Item.DeleteConfirm)) {
                          maskStore.delete(m.id);
                        }
                      }}
                    />
                  )}
                </div>
              </div>
            ))}
            {masks.length === 0 && (
              <div className={styles["mask-empty"]}>
                {Locale.Mask.Page.Empty}
              </div>
            )}
          </div>
        </div>
      </div>

      {editingMask && (
        <div className="modal-mask">
          <Modal
            title={Locale.Mask.EditModal.Title(editingMask?.builtin)}
            onClose={closeMaskModal}
            actions={[
              <IconButton
                icon={<DownloadIcon />}
                text={Locale.Mask.EditModal.Download}
                key="export"
                bordered
                onClick={() =>
                  downloadAs(
                    JSON.stringify(editingMask),
                    `${editingMask.name}.json`,
                  )
                }
              />,
              <IconButton
                key="copy"
                icon={<CopyIcon />}
                bordered
                text={Locale.Mask.EditModal.Clone}
                onClick={() => {
                  navigate(Path.Masks);
                  maskStore.create(editingMask);
                  setEditingMaskId(undefined);
                }}
              />,
            ]}
          >
            <MaskConfig
              mask={editingMask}
              updateMask={(updater) =>
                maskStore.updateMask(editingMaskId!, updater)
              }
              readonly={editingMask.builtin}
            />
          </Modal>
        </div>
      )}
    </ErrorBoundary>
  );
}
