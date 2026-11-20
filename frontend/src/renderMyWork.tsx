import { fireEvent, render } from "@testing-library/react";
import App from "./App";

export function renderMyWork() {
  const app = render(<App />);
  fireEvent.click(app.getByRole("button", { name: /^我的工作/ }));
  return app;
}
