import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ScheduleAvatar } from "./ScheduleAvatar";
import type { SchedulePerson } from "./scheduleApi";

export function ScheduleNodeOwners({ name, owners, style }: {
  name: string;
  owners: SchedulePerson[];
  style: React.CSSProperties;
}) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const open = (hovered || focused) && !dismissed;

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
  useLayoutEffect(updatePosition, [open, owners]);

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

  return <>
    <span ref={anchor} className="schedule-current-node" style={style} tabIndex={0}
      aria-describedby={open ? id : undefined}
      onMouseEnter={() => { setDismissed(false); setHovered(true); }}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => { setDismissed(false); setFocused(true); }}
      onBlur={() => setFocused(false)}
      onKeyDown={(event) => { if (event.key === "Escape") setDismissed(true); }}>
      {name}
    </span>
    {open && createPortal(<span ref={tooltip} id={id} role="tooltip" className="schedule-node-owners-tooltip"
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? "visible" : "hidden" }}>
      {owners.map((person) => <span key={person.id || person.name} className="schedule-node-owner">
        <ScheduleAvatar person={person.id ? person : undefined} />
        <span>{person.name}</span>
      </span>)}
    </span>, document.body)}
  </>;
}
