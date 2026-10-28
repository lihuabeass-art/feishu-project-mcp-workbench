import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { FileText } from "lucide-react";
import { ExternalLink } from "./ExternalLink";
import { loadLinkMetadata, type LinkMetadata } from "./linkMetadata";
import "./MetadataLink.css";

function plainText(children: ReactNode): string | null {
  let text = "";
  for (const child of Children.toArray(children)) {
    if (typeof child === "string" || typeof child === "number") text += child;
    else if (
      isValidElement<{ children?: ReactNode }>(child) &&
      child.props.children != null
    ) {
      const part = plainText(child.props.children);
      if (part == null) return null;
      text += part;
    } else return null;
  }
  return text;
}

function isBareLink(href: string, children: ReactNode): boolean {
  const text = plainText(children)?.trim();
  if (text == null) return false;
  if (!text || text === href) return true;
  try {
    const target = new URL(href);
    return (
      new URL(text.startsWith("www.") ? `${target.protocol}//${text}` : text)
        .href === target.href
    );
  } catch {
    return false;
  }
}

function ResolvedLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const bare = isBareLink(href, children);
  const holder = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [metadata, setMetadata] = useState<LinkMetadata | null>(null);
  useEffect(() => {
    if (!bare) return;
    if (!holder.current || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(holder.current);
    return () => observer.disconnect();
  }, [bare]);
  useEffect(() => {
    if (!bare || !visible) return;
    let active = true;
    void loadLinkMetadata(href)
      .then((value) => {
        if (active) setMetadata(value);
      })
      .catch(() => {
        /* 标题补全失败时继续使用原链接。 */
      });
    return () => {
      active = false;
    };
  }, [href, bare, visible]);
  const resolved = bare && metadata;
  const original = plainText(children)?.trim() === "" ? href : children;
  return (
    <span ref={holder}>
      <ExternalLink href={href} title={href}>
        {resolved ? (
          <>
            {resolved.kind !== "webpage" && (
              <FileText className="link-document-icon" aria-hidden="true" />
            )}
            {resolved.title}
          </>
        ) : (
          original
        )}
      </ExternalLink>
    </span>
  );
}

/** 原文名称优先；每个 URL 独立挂载，迟到的标题不会串到新链接。 */
export function MetadataLink(props: { href: string; children: ReactNode }) {
  return <ResolvedLink key={props.href} {...props} />;
}
