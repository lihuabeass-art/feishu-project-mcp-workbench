import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useScrollIsolation } from "./useScrollIsolation";
import "./SettingsPage.css";

export interface SettingsSection {
  id: string;
  label: string;
  icon: LucideIcon;
  content: ReactNode;
}

export function SettingsPage({
  active,
  sections,
}: {
  active: boolean;
  sections: SettingsSection[];
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const isolateScroll = useScrollIsolation(viewport);
  const navigation = useRef<HTMLElement>(null);
  const scrollTarget = useRef<number | null>(null);
  const [current, setCurrent] = useState(sections[0]?.id);
  const sectionIds = sections.map((section) => section.id).join(",");

  function scrollOffset() {
    const nav = navigation.current;
    const content =
      viewport.current?.querySelector<HTMLElement>(".settings-content");
    if (!nav || !content) return 4;
    return nav.getBoundingClientRect().right >
      content.getBoundingClientRect().left
      ? nav.offsetHeight + 12
      : 4;
  }

  useEffect(() => {
    if (!active || !viewport.current || !navigation.current) return;
    const scroller = viewport.current;
    const nav = navigation.current;
    const groups = [
      ...scroller.querySelectorAll<HTMLElement>("[data-settings-section]"),
    ];
    let frame = 0;
    const update = () => {
      frame = 0;
      const offset = scrollOffset();
      scroller.style.setProperty(
        "--settings-navigation-height",
        `${nav.offsetHeight}px`,
      );
      scroller.style.setProperty(
        "--settings-tail-space",
        `${Math.max(
          0,
          scroller.clientHeight -
            offset -
            (groups.at(-1)?.getBoundingClientRect().height ?? 0) -
            4,
        )}px`,
      );
      // 平滑定位经过其他分组时，保留用户刚选择的目标。
      if (scrollTarget.current !== null) {
        if (Math.abs(scroller.scrollTop - scrollTarget.current) > 1) return;
        scrollTarget.current = null;
      }
      const threshold = scroller.getBoundingClientRect().top + offset + 8;
      let selected = groups[0];
      for (const group of groups) {
        if (group.getBoundingClientRect().top <= threshold) selected = group;
      }
      const selectedId = selected?.dataset.settingsSection;
      if (selectedId) setCurrent(selectedId);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const resumeTracking = () => {
      scrollTarget.current = null;
      schedule();
    };
    const endScroll = (event: Event) => {
      if (event.target === scroller) resumeTracking();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "PageUp",
          "PageDown",
          "Home",
          "End",
          " ",
        ].includes(event.key)
      )
        resumeTracking();
    };
    scroller.addEventListener("scroll", schedule, { passive: true });
    scroller.addEventListener("scrollend", endScroll);
    scroller.addEventListener("wheel", resumeTracking, { passive: true });
    scroller.addEventListener("touchstart", resumeTracking, { passive: true });
    scroller.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", resumeTracking);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(schedule);
    observer?.observe(scroller);
    observer?.observe(nav);
    groups.forEach((group) => observer?.observe(group));
    update();
    return () => {
      scroller.removeEventListener("scroll", schedule);
      scroller.removeEventListener("scrollend", endScroll);
      scroller.removeEventListener("wheel", resumeTracking);
      scroller.removeEventListener("touchstart", resumeTracking);
      scroller.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", resumeTracking);
      scrollTarget.current = null;
      observer?.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [active, sectionIds]);

  return (
    <section className="settings-page" aria-label="连接与配置" hidden={!active}>
      <header className="settings-page-heading">
        <h1>设置</h1>
        <p>管理连接、操作习惯与应用偏好</p>
      </header>
      <div
        ref={isolateScroll}
        className="settings-layout scroll-isolation-boundary"
        role="region"
        aria-label="设置内容"
        tabIndex={0}
      >
        <div className="settings-columns">
          <nav
            ref={navigation}
            className="settings-index"
            aria-label="设置索引"
          >
            <ul>
              {sections.map(({ id, label, icon: Icon }) => (
                <li key={id}>
                  <a
                    href={`#settings-${id}`}
                    aria-current={current === id ? "location" : undefined}
                    onClick={(event) => {
                      const scroller = viewport.current;
                      const target = scroller?.querySelector<HTMLElement>(
                        `[data-settings-section="${id}"]`,
                      );
                      if (!scroller || !target) return;
                      event.preventDefault();
                      const targetTop =
                        scroller.scrollTop +
                        target.getBoundingClientRect().top -
                        scroller.getBoundingClientRect().top -
                        scrollOffset();
                      const top = Math.max(
                        0,
                        Math.min(
                          targetTop,
                          scroller.scrollHeight - scroller.clientHeight,
                        ),
                      );
                      scrollTarget.current = top;
                      if (event.detail === 0)
                        target.focus({ preventScroll: true });
                      scroller.scrollTo({
                        top,
                        behavior: window.matchMedia?.(
                          "(prefers-reduced-motion: reduce)",
                        ).matches
                          ? "auto"
                          : "smooth",
                      });
                      setCurrent(id);
                    }}
                  >
                    <Icon size={16} aria-hidden="true" />
                    <span>{label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="settings-content">
            {sections.map(({ id, label, content }) => (
              <section
                key={id}
                id={`settings-${id}`}
                data-settings-section={id}
                className="settings-panel settings-section"
                aria-label={label}
                tabIndex={-1}
              >
                {content}
              </section>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
