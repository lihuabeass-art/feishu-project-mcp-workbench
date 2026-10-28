import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ImagePreview } from "./ImagePreview";
import { ExternalLink } from "./ExternalLink";
import { MetadataLink } from "./MetadataLink";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { loadFieldImage } from "./api";
import { asError, itemKey } from "./model";
import { readable } from "./detailFields";
import type { CachedItem } from "./types";

interface ImageContext {
  itemId: CachedItem["id"];
  fieldKey: string;
}
const Images = createContext<ImageContext | null>(null);

function httpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function imageUrl(value: string) {
  if (!httpUrl(value)) return false;
  const url = new URL(value);
  return (
    /\.(png|jpe?g|gif|webp|bmp)$/i.test(url.pathname) ||
    (url.hostname === "project.feishu.cn" &&
      url.pathname.startsWith("/goapi/v5/platform/file/stream/download/"))
  );
}

function FieldImage({ url, alt = "" }: { url: string; alt?: string }) {
  const context = useContext(Images);
  const downloadable = httpUrl(url) && new URL(url).protocol === "https:";
  const holder = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState(false);
  useEffect(() => {
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
  }, []);
  useEffect(() => {
    if (!context || !visible || !downloadable) return;
    let active = true;
    setSrc("");
    setError("");
    void loadFieldImage(context.itemId, context.fieldKey, url, attempt > 0)
      .then((data) => {
        if (active) setSrc(data);
      })
      .catch((error: unknown) => {
        if (active) setError(asError(error).message);
      });
    return () => {
      active = false;
    };
  }, [context, url, visible, attempt, downloadable]);
  if (!downloadable)
    return <ExternalLink href={url}>{alt || "查看图片"}</ExternalLink>;
  return (
    <div ref={holder} className="field-image">
      {error ? (
        <div className="field-image-placeholder" role="status">
          <span>图片加载失败</span>
          <small>{error}</small>
          <button
            type="button"
            className="secondary"
            onClick={() => setAttempt((n) => n + 1)}
          >
            重试图片
          </button>
        </div>
      ) : src ? (
        <button
          type="button"
          className="field-image-open"
          aria-label={`放大查看${alt || "图片"}`}
          onClick={() => setPreview(true)}
        >
          <img
            src={src}
            alt={alt || "业务字段图片"}
            loading="lazy"
            onError={() => {
              setError("图片内容无法解码，请重试或在飞书中查看");
              setSrc("");
            }}
          />
        </button>
      ) : (
        <div className="field-image-placeholder" role="status">
          {visible ? "正在加载图片…" : "图片待加载"}
        </div>
      )}
      {alt && <div className="field-image-caption">{alt}</div>}
      {preview && src && (
        <ImagePreview src={src} alt={alt} close={() => setPreview(false)} />
      )}
    </div>
  );
}

// 保持组件类型稳定，详情重绘时复用已加载的图片及其预览状态。
const markdownComponents: Components = {
  p: ({ children }) => <div className="field-paragraph">{children}</div>,
  img: ({ src, alt }) =>
    httpUrl(src) ? (
      <FieldImage key={src} url={src} alt={alt} />
    ) : (
      <span className="muted">图片地址不可用</span>
    ),
  a: ({ href, children }) =>
    httpUrl(href) ? (
      <MetadataLink href={href}>{children}</MetadataLink>
    ) : (
      <span>{children}</span>
    ),
};

function FieldMarkdown({ text }: { text: string }) {
  return (
    <div className="field-markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={markdownComponents}
      >
        {text}
      </Markdown>
    </div>
  );
}

function RichValue({ value }: { value: unknown }) {
  if (value == null || value === "")
    return <span className="muted">未提供</span>;
  if (typeof value === "string") {
    if (imageUrl(value)) return <FieldImage key={value} url={value} />;
    if (value === "true" || value === "false")
      return <span>{readable(value)}</span>;
    return <FieldMarkdown text={value} />;
  }
  if (typeof value !== "object") return <span>{readable(value)}</span>;
  // 字符串数组仍逐项走 Markdown/图片渲染，只合并人员、枚举等扁平对象。
  const text =
    Array.isArray(value) && value.some((v) => typeof v === "string")
      ? null
      : readable(value);
  if (text != null) return <span>{text}</span>;
  if (Array.isArray(value))
    return value.length ? (
      <div className="field-values">
        {value.map((v, i) => (
          <RichValue key={i} value={v} />
        ))}
      </div>
    ) : (
      <span className="muted">无</span>
    );
  const object = value as Record<string, unknown>;
  const kind = String(object.type ?? object.tag ?? "").toLowerCase();
  const url =
    object.url ??
    object.file_url ??
    object.download_url ??
    object.src ??
    (object.attrs as Record<string, unknown> | undefined)?.src;
  const name =
    typeof object.name === "string"
      ? object.name
      : typeof object.alt === "string"
        ? object.alt
        : "";
  if (httpUrl(url) && kind.includes("/") && !kind.startsWith("image/"))
    return <MetadataLink href={url}>{name || url}</MetadataLink>;
  if (
    httpUrl(url) &&
    (kind === "image" ||
      kind === "img" ||
      kind.startsWith("image/") ||
      imageUrl(url) ||
      /\.(png|jpe?g|gif|webp|bmp)$/i.test(name))
  )
    return <FieldImage key={url} url={url} alt={name} />;
  if (httpUrl(url) && ["", "hyperlink", "link", "a", "file"].includes(kind)) {
    const label = [object.text, object.label, object.name, object.title].find(
      (v): v is string => typeof v === "string" && !!v.trim(),
    );
    return <MetadataLink href={url}>{label || url}</MetadataLink>;
  }
  if (
    [
      "text",
      "paragraph",
      "doc",
      "richtext",
      "rich_text",
      "line break",
      "hardbreak",
      "hyperlink",
    ].includes(kind)
  ) {
    if (kind === "line break" || kind === "hardbreak") return <br />;
    return (
      <RichValue
        value={object.text ?? object.content ?? object.children ?? ""}
      />
    );
  }
  if (Array.isArray(object.children))
    return <RichValue value={object.children} />;
  if (Array.isArray(object.content))
    return <RichValue value={object.content} />;
  if (!kind && typeof object.text === "string")
    return <FieldMarkdown text={object.text} />;
  const label = object.label ?? object.name ?? object.iso_time;
  return (
    <details className="field-object">
      <summary>{label != null ? String(label) : "查看字段内容"}</summary>
      <dl>
        {Object.entries(object).map(([key, v]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>
              <RichValue value={v} />
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function BusinessField({
  value,
  itemId,
  fieldKey,
}: ImageContext & { value: unknown }) {
  // 复合身份/字段改变时整个媒体子树重建，避免旧图和预览串到其他事项。
  const identity = `${itemKey({ id: itemId } as CachedItem)}:${fieldKey}`;
  const context = useRef<ImageContext>({ itemId, fieldKey });
  if (
    itemKey({ id: context.current.itemId } as CachedItem) !==
      itemKey({ id: itemId } as CachedItem) ||
    context.current.fieldKey !== fieldKey
  )
    context.current = { itemId, fieldKey };
  return (
    <Images.Provider value={context.current}>
      <div key={identity} className="business-field-content">
        <RichValue value={value} />
      </div>
    </Images.Provider>
  );
}
