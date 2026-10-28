import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, BookOpen, ChevronDown, Expand, X } from "lucide-react";
import { ExternalLink } from "./ExternalLink";
import copyTokenImage from "./assets/mcp-guide/copy-token.png";
import openProjectImage from "./assets/mcp-guide/open-feishu-project.png";
import openMcpImage from "./assets/mcp-guide/open-mcp.png";
import "./McpTokenGuide.css";

const configurationUrl = "https://project.feishu.cn/b/mcp";
const documentationUrl = "https://project.feishu.cn/b/helpcenter/1ykiuvvj/qaq5d7ru#02f9a76f";
const illustrations = {
  token: {
    src: copyTokenImage,
    title: "选择 HTTP Header 并复制 Token",
    description: "先选择 HTTP Header 页签，再点击下方的复制 Token。Token 在示例中已隐藏。",
  },
  project: {
    src: openProjectImage,
    title: "从飞书工作台打开飞书项目",
    description: "打开飞书客户端的工作台，点击飞书项目。",
  },
  entry: {
    src: openMcpImage,
    title: "进入 MCP 配置",
    description: "在飞书项目首页找到 MCP & CLI，点击连接你的 AI 工具。",
  },
};
type Illustration = keyof typeof illustrations;

function GuideImage({ kind }: { kind: Illustration }) {
  const illustration = illustrations[kind];
  return (
    <span className="mcp-guide-image">
      <img src={illustration.src} alt={illustration.description} loading="lazy" />
      {kind === "token" && <span className="mcp-guide-header-highlight" aria-hidden="true" />}
    </span>
  );
}

export function McpTokenGuide({ open, onOpenChange, inputId, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inputId: string;
  children: ReactNode;
}) {
  const [preview, setPreview] = useState<Illustration | null>(null);
  const panelId = useId();
  const titleId = useId();
  const previewTitleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const previewTrigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!preview || !dialog.current) return;
    const element = dialog.current;
    element.showModal();
    return () => {
      element.close();
      previewTrigger.current?.focus();
    };
  }, [preview]);

  const imageButton = (kind: Illustration) => (
    <button type="button" className="mcp-guide-image-button"
      aria-label={`放大：${illustrations[kind].title}`} aria-haspopup="dialog"
      onClick={(event) => { previewTrigger.current = event.currentTarget; setPreview(kind); }}>
      <GuideImage kind={kind} />
      <span className="mcp-guide-image-caption"><Expand size={13} aria-hidden="true" />点击放大</span>
    </button>
  );

  return (
    <div className="mcp-token-guide">
      <div className="mcp-token-header">
        <label htmlFor={inputId}>MCP Token</label>
        <div className="mcp-token-actions">
          <ExternalLink href={configurationUrl} title="在浏览器中打开飞书项目官方 MCP 配置页">
            获取 Token<ArrowUpRight size={14} aria-hidden="true" />
          </ExternalLink>
          <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => onOpenChange(!open)}>
            <BookOpen size={14} aria-hidden="true" />{open ? "收起教程" : "查看教程"}
          </button>
        </div>
      </div>
      <p className="mcp-token-intro">
        打开飞书项目 MCP 配置，选择 <strong>HTTP Header</strong>，复制 Token 后粘贴到下方。
      </p>
      {children}
      <section id={panelId} hidden={!open} className="mcp-guide-panel" aria-labelledby={titleId}>
        <div className="mcp-guide-heading">
          <h3 id={titleId}>获取飞书项目 MCP Token</h3>
          <p>按下面 3 步完成连接</p>
        </div>
        <div className="mcp-guide-overview">
          <ol className="mcp-guide-steps">
            <li>
              <span className="mcp-guide-step-number" aria-hidden="true">1</span>
              <div><h4>打开配置页</h4>
                <p>登录你使用飞书项目的账号。首次使用时，按页面提示启用 MCP，并选择所需访问权限。</p>
                <ExternalLink href={configurationUrl}>打开飞书项目 MCP 配置<ArrowUpRight size={13} aria-hidden="true" /></ExternalLink>
              </div>
            </li>
            <li>
              <span className="mcp-guide-step-number" aria-hidden="true">2</span>
              <div><h4>选择 HTTP Header，复制 Token</h4>
                <p>在「连接 MCP」区域选择 <strong>HTTP Header</strong>，点击 <strong>复制 Token</strong>。这里只需 Token 本身，无需复制 URL 或整段 JSON。</p>
              </div>
            </li>
            <li>
              <span className="mcp-guide-step-number" aria-hidden="true">3</span>
              <div><h4>返回软件，保存并检查</h4>
                <p>将 Token 粘贴到上方输入框，点击 <strong>保存 Token</strong>，再点击 <strong>检查连接</strong>。</p>
              </div>
            </li>
          </ol>
          <figure className="mcp-guide-key-image">
            {imageButton("token")}
            <figcaption>选择 HTTP Header → 复制 Token</figcaption>
          </figure>
        </div>
        <details className="mcp-guide-fallback">
          <summary><ChevronDown size={14} aria-hidden="true" />找不到配置入口？</summary>
          <p>也可以进入飞书项目，将鼠标移到左下角个人头像，选择 <strong>配置 MCP</strong>。</p>
          <p>从飞书客户端进入时，可按下面的路径操作：</p>
          <div className="mcp-guide-fallback-images">
            <figure>{imageButton("project")}<figcaption>① 飞书工作台 → 飞书项目</figcaption></figure>
            <figure>{imageButton("entry")}<figcaption>② MCP &amp; CLI → 连接你的 AI 工具</figcaption></figure>
          </div>
          <p className="mcp-guide-footnote">页面布局可能随飞书版本变化；企业专用部署请从你所在的飞书项目环境进入。</p>
        </details>
        <div className="mcp-guide-footer">
          <span>图片可离线查看 · 示例 Token 已隐藏</span>
          <ExternalLink href={documentationUrl}>官方使用说明<ArrowUpRight size={13} aria-hidden="true" /></ExternalLink>
        </div>
      </section>
      {preview && createPortal(
        <dialog ref={dialog} className="mcp-guide-preview" aria-labelledby={previewTitleId}
          onCancel={(event) => { event.preventDefault(); setPreview(null); }}
          onClose={() => setPreview(null)}
          onClick={(event) => { if (event.target === event.currentTarget) setPreview(null); }}>
          <div className="mcp-guide-preview-header">
            <h3 id={previewTitleId}>{illustrations[preview].title}</h3>
            <button type="button" className="icon-button" aria-label="关闭教程图片" autoFocus onClick={() => setPreview(null)}><X size={18} /></button>
          </div>
          <div className="mcp-guide-preview-content" tabIndex={0} aria-label="教程图片">
            <GuideImage kind={preview} />
          </div>
          <p className="mcp-guide-preview-description">{illustrations[preview].description}</p>
        </dialog>, document.body,
      )}
    </div>
  );
}
