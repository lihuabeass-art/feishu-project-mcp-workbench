import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ScheduleAvatar } from "./ScheduleAvatar";
import type { SchedulePerson } from "./scheduleApi";
import { useScrollIsolation } from "./useScrollIsolation";

export interface ScheduleCurrentNodeSummaryItem {
  id: string;
  name: string;
  owners: SchedulePerson[];
  style: React.CSSProperties;
  isCurrentOwner?: boolean;
}

function useAnchoredTooltip(deps: unknown[], interactive = false) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const tooltipBoundary = useScrollIsolation(tooltip);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelLeave = () => {
    if (leaveTimer.current !== null) clearTimeout(leaveTimer.current);
    leaveTimer.current = null;
  };
  useEffect(() => cancelLeave, []);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const open = (hovered || focused) && !dismissed;
  const enter = () => { cancelLeave(); setDismissed(false); setHovered(true); };
  const leave = () => {
    cancelLeave();
    if (interactive) leaveTimer.current = setTimeout(() => setHovered(false), 120);
    else setHovered(false);
  };
  const blur = (event: React.FocusEvent<HTMLSpanElement>) => {
    if (event.relatedTarget instanceof Node && (anchor.current?.contains(event.relatedTarget) || tooltip.current?.contains(event.relatedTarget))) return;
    setFocused(false);
  };

  const updatePosition = () => {
    if (!open || !anchor.current || !tooltip.current) return;
    const source = anchor.current.getBoundingClientRect();
    if (source.bottom < 0 || source.top > window.innerHeight) { setDismissed(true); return; }
    const box = tooltip.current.getBoundingClientRect();
    const margin = 8;
    const below = source.bottom + margin;
    const top = below + box.height <= window.innerHeight - margin ? below : source.top - box.height - margin;
    setPosition({
      left: Math.max(margin, Math.min(source.left, window.innerWidth - box.width - margin)),
      top: Math.max(margin, Math.min(top, window.innerHeight - box.height - margin)),
    });
  };
  useLayoutEffect(updatePosition, [open, ...deps]);

  useEffect(() => {
    if (!open) return;
    const dismiss = () => setDismissed(true);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  const triggerProps = {
    ref: anchor,
    tabIndex: 0,
    "aria-describedby": open ? id : undefined,
    "aria-keyshortcuts": interactive ? "ArrowDown" : undefined,
    onMouseEnter: enter,
    onMouseLeave: leave,
    onFocus: () => { setDismissed(false); setFocused(true); },
    onBlur: blur,
    onKeyDown: (event: React.KeyboardEvent<HTMLSpanElement>) => {
      if (interactive && event.key === "ArrowDown" && event.currentTarget === anchor.current) {
        event.preventDefault();
        tooltip.current?.focus();
      }
      if (event.key === "Escape") {
        if (interactive && event.currentTarget === tooltip.current) anchor.current?.focus();
        setDismissed(true);
      }
    },
  };

  const renderTooltip = (content: ReactNode, extraClassName = "") =>
    open && createPortal(
      <span
        ref={tooltipBoundary}
        id={id}
        role="tooltip"
        className={`schedule-node-owners-tooltip scroll-isolation-boundary${extraClassName ? ` ${extraClassName}` : ""}`}
        tabIndex={interactive ? 0 : undefined}
        onMouseEnter={interactive ? enter : undefined}
        onMouseLeave={interactive ? leave : undefined}
        onFocus={interactive ? () => setFocused(true) : undefined}
        onBlur={interactive ? blur : undefined}
        onKeyDown={interactive ? triggerProps.onKeyDown : undefined}
        style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? "visible" : "hidden" }}
      >
        {content}
      </span>,
      document.body,
    );

  return { triggerProps, renderTooltip };
}

export function ScheduleNodeOwners({ name, owners, style, isCurrentOwner = false }: {
  name: string;
  owners: SchedulePerson[];
  style: React.CSSProperties;
  isCurrentOwner?: boolean;
}) {
  const { triggerProps, renderTooltip } = useAnchoredTooltip([owners]);

  return <>
    <span {...triggerProps} className={`schedule-current-node${isCurrentOwner ? " is-mine" : ""}`} style={style}>
      {name}
    </span>
    {renderTooltip(
      owners.map((person) => (
        <span key={person.id || person.name} className="schedule-node-owner">
          <ScheduleAvatar person={person.id ? person : undefined} />
          <span>{person.name}</span>
        </span>
      )),
    )}
  </>;
}

export function ScheduleParallelNodesSummary({ nodes, hiddenNodes }: {
  nodes: ScheduleCurrentNodeSummaryItem[];
  hiddenNodes: ScheduleCurrentNodeSummaryItem[];
}) {
  const { triggerProps, renderTooltip } = useAnchoredTooltip([nodes, hiddenNodes], true);

  return <>
    <span
      {...triggerProps}
      className="schedule-current-nodes-more"
      aria-label={`其余 ${hiddenNodes.length} 个并行节点，共 ${nodes.length} 个进行中节点`}
    >
      <span className="schedule-more-dots" aria-hidden="true">
        {hiddenNodes.slice(0, 3).map((node) => (
          <span key={node.id} style={node.style} />
        ))}
      </span>
      <span>+{hiddenNodes.length} 并行</span>
    </span>
    {renderTooltip(
      nodes.map((node) => (
        <span
          key={node.id}
          className={`schedule-parallel-node-row${node.isCurrentOwner ? " is-mine" : ""}`}
          style={node.style}
        >
          <span className="schedule-parallel-node-name">{node.name}</span>
          <span className="schedule-parallel-node-owners">
            {node.owners.map((person) => (
              <span key={person.id || person.name} className="schedule-node-owner">
                <ScheduleAvatar person={person.id ? person : undefined} />
                <span>{person.name}</span>
              </span>
            ))}
          </span>
        </span>
      )),
      "is-parallel-summary",
    )}
  </>;
}
