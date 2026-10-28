import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// 窗口关闭了 Tauri 原生拖放以启用 HTML5 拖拽排序；拖入外部文件时不让 WebView 导航到该文件。
for (const type of ["dragover", "drop"] as const) {
  window.addEventListener(type, (event) => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "none";
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
