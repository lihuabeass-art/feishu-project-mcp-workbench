import { useEffect, useRef, useState } from "react";
import { asError } from "./model";
import { loadFieldImage } from "./api";
import {
  getCreationImage,
  getUploadedCreationImage,
  localCreationImageId,
  splitCreationMarkdown,
  type CreationImageScope,
  type CreationMarkdownPart,
} from "./creationImages";
import "./MarkdownClipboard.css";

export type CreationImagePart = Extract<
  CreationMarkdownPart,
  { kind: "image" }
>;
export type CreationImageDisplay = {
  dataUrl?: string;
  loading?: boolean;
  error?: string;
  external?: boolean;
};
export const creationImagePreviewKey = (part: CreationImagePart) =>
  JSON.stringify([part.url, part.fileToken || ""]);
export const creationImageScopeKey = (scope: CreationImageScope) =>
  JSON.stringify([
    scope.context,
    scope.target.source_id,
    scope.target.project_key,
    scope.target.type_key,
    scope.fieldKey,
    scope.workflow?.imageFieldKey,
  ]);

/** 优先读取本机图片；流程中的云端图仅使用已确认的真实事项字段，不上传或修改正文。 */
export function useCreationImagePreviews(
  parts: CreationMarkdownPart[],
  scope: CreationImageScope,
) {
  const scopeKey = creationImageScopeKey(scope);
  const active = useRef(scopeKey);
  active.current = scopeKey;
  const revision = useRef(0);
  const requested = useRef(new Set<string>());
  const [state, setState] = useState<{
    scope: string;
    images: Record<string, CreationImageDisplay>;
  }>({ scope: scopeKey, images: {} });
  const images = parts.filter(
    (part): part is CreationImagePart => part.kind === "image",
  );
  const imagesKey = JSON.stringify(images.map(creationImagePreviewKey));
  useEffect(() => {
    const current = ++revision.current;
    requested.current.clear();
    setState({ scope: scopeKey, images: {} });
    return () => {
      if (revision.current === current) ++revision.current;
    };
  }, [scopeKey]);

  async function read(part: CreationImagePart) {
    const key = creationImagePreviewKey(part),
      current = revision.current;
    const identity = scopeKey;
    const isCurrent = () =>
      active.current === identity && revision.current === current;
    const imageId = localCreationImageId(part.url);
    if ((!imageId && !part.fileToken && !scope.workflow) || (scope.workflow && !scope.workflow.imageFieldKey)) {
      setState((previous) => ({
        scope: identity,
        images: {
          ...(previous.scope === identity ? previous.images : {}),
          [key]: { external: true },
        },
      }));
      return;
    }
    setState((previous) => ({
      scope: identity,
      images: {
        ...(previous.scope === identity ? previous.images : {}),
        [key]: { loading: true },
      },
    }));
    try {
      const preview = imageId
        ? await getCreationImage(scope, imageId)
        : scope.workflow
          ? await getUploadedCreationImage(scope, part.url, part.fileToken || "").catch(async () => ({ data_url: await loadFieldImage(scope.workflow!.itemId, scope.workflow!.imageFieldKey!, part.url) }))
          : await getUploadedCreationImage(scope, part.url, part.fileToken!);
      if (!isCurrent()) return;
      if (
        !/^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(
          preview.data_url,
        )
      )
        throw new Error("本机图片预览暂不可用，正文和草稿已保留。");
      setState((previous) => ({
        scope: identity,
        images: {
          ...(previous.scope === identity ? previous.images : {}),
          [key]: { dataUrl: preview.data_url },
        },
      }));
    } catch (failure) {
      if (isCurrent())
        setState((previous) => ({
          scope: identity,
          images: {
            ...(previous.scope === identity ? previous.images : {}),
            [key]: { error: asError(failure).message },
          },
        }));
    }
  }
  useEffect(() => {
    for (const part of images) {
      const key = creationImagePreviewKey(part);
      if (requested.current.has(key)) continue;
      requested.current.add(key);
      void read(part);
    }
  }, [scopeKey, imagesKey]);
  return { images: state.scope === scopeKey ? state.images : {}, retry: read };
}

export function MarkdownPreview({
  value,
  scope,
}: {
  value: string;
  scope: CreationImageScope;
}) {
  const parts = splitCreationMarkdown(value);
  const preview = useCreationImagePreviews(parts, scope);
  let imageIndex = 0;
  return (
    <div className="markdown-preview">
      {parts.map((part) => {
        if (part.kind === "text")
          return (
            <span className="markdown-preview-text" key={part.start}>
              {part.text}
            </span>
          );
        ++imageIndex;
        const alt =
          part.alt && part.alt !== "截图" ? part.alt : `截图 ${imageIndex}`;
        const image = preview.images[creationImagePreviewKey(part)];
        return (
          <span className="markdown-preview-image" key={part.start}>
            {image?.dataUrl ? (
              <img src={image.dataUrl} alt={alt} />
            ) : (
              <span className="markdown-editor-image-placeholder">
                {alt}
                <small>
                  {image?.external
                    ? scope.workflow ? "请在飞书中查看图片" : "外部图片，创建后可在飞书查看"
                    : image?.error
                      ? "图片暂未显示，正文和草稿已保留"
                      : "正在读取本机图片…"}
                </small>
              </span>
            )}
            {image?.error && (
              <button
                type="button"
                className="markdown-image-retry"
                onClick={() => void preview.retry(part)}
              >
                重新读取图片
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
