import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import userGuide from "../../docs/10-user/用户使用手册.md";
import { Path } from "../constant";
import CloseIcon from "../icons/close.svg";
import Locale from "../locales";
import { IconButton } from "./button";
import { ErrorBoundary } from "./error";
import { Markdown } from "./markdown";
import styles from "./help-page.module.scss";

type GuideSection = {
  id: string;
  title: string;
  content: string;
};

function createSectionId(title: string, index: number) {
  const normalized = title
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-|-$/g, "");
  return normalized || `section-${index + 1}`;
}

function parseGuide(content: string): GuideSection[] {
  const sections = content.split(/(?=^##\s+)/gm);
  return sections
    .map((section, index) => {
      const title = section.match(/^##\s+(.+)$/m)?.[1]?.trim();
      if (!title) return null;
      return {
        id: createSectionId(title, index),
        title,
        content: section.trim(),
      };
    })
    .filter((section): section is GuideSection => Boolean(section));
}

const guideSections = parseGuide(userGuide);

export function HelpPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleSections = useMemo(() => {
    if (!normalizedQuery) return guideSections;
    return guideSections.filter((section) =>
      section.content.toLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery]);

  const close = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(Path.Home);
  };

  const scrollToSection = (sectionId: string) => {
    document
      .getElementById(`help-${sectionId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <ErrorBoundary>
      <div className={styles.page}>
        <div className="window-header" data-tauri-drag-region>
          <div className="window-header-title">
            <div className="window-header-main-title">{Locale.Help.Title}</div>
            <div className="window-header-sub-title">
              {Locale.Help.SubTitle}
            </div>
          </div>
          <div className="window-actions">
            <div className="window-action-button">
              <IconButton
                aria={Locale.UI.Close}
                icon={<CloseIcon />}
                onClick={close}
                bordered
              />
            </div>
          </div>
        </div>

        <div className={styles.layout}>
          <aside className={styles.sidebar}>
            <input
              className={styles.search}
              type="search"
              value={query}
              placeholder={Locale.Help.Search}
              aria-label={Locale.Help.Search}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            <div className={styles["contents-title"]}>
              {Locale.Help.Contents}
            </div>
            <nav className={styles.contents}>
              {visibleSections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => scrollToSection(section.id)}
                >
                  {section.title.replace(/^\d+\.\s*/, "")}
                </button>
              ))}
            </nav>
          </aside>

          <main className={styles.content}>
            {visibleSections.length ? (
              visibleSections.map((section) => (
                <section key={section.id} id={`help-${section.id}`}>
                  <Markdown content={section.content} defaultShow />
                </section>
              ))
            ) : (
              <div className={styles.empty}>{Locale.Help.NoResults}</div>
            )}
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
}
