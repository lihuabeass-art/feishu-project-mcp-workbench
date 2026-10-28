import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type Appearance, type Theme } from "./ThemeProvider";

const modes = [
  { value: "light", label: "日间模式", Icon: Sun },
  { value: "dark", label: "暗黑模式", Icon: Moon },
  { value: "system", label: "跟随系统", Icon: Monitor },
] as const;

const appearances = [
  { value: "classic", label: "经典绿意", description: "柔和自然 · 专注工作" },
  { value: "pearl", label: "珍珠全息", description: "虹彩光晕 · 通透玻璃" },
] as const;

export function ThemeControl() {
  const { theme, setTheme, appearance, setAppearance, error } = useTheme();
  const current = modes.find((mode) => mode.value === theme)!;
  const Icon = current.Icon;
  const description = `外观：${current.label}${appearance === "pearl" ? " · 珍珠全息" : ""}`;

  return (
    <div className="theme-control">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="theme-trigger"
            aria-label={description}
            title={description}
          >
            <Icon size={17} aria-hidden="true" />
            {appearance === "pearl" && (
              <span className="theme-appearance-dot" aria-hidden="true" />
            )}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="theme-menu"
            align="end"
            sideOffset={8}
            collisionPadding={10}
          >
            <DropdownMenu.Label className="theme-menu-label">
              明暗模式
            </DropdownMenu.Label>
            <DropdownMenu.RadioGroup
              aria-label="明暗模式"
              value={theme}
              onValueChange={(value) => setTheme(value as Theme)}
            >
              {modes.map(({ value, label, Icon: ModeIcon }) => (
                <DropdownMenu.RadioItem
                  key={value}
                  value={value}
                  className="theme-menu-item"
                >
                  <ModeIcon size={16} aria-hidden="true" />
                  <span>{label}</span>
                  <DropdownMenu.ItemIndicator className="theme-menu-check">
                    <Check size={15} aria-hidden="true" />
                  </DropdownMenu.ItemIndicator>
                </DropdownMenu.RadioItem>
              ))}
            </DropdownMenu.RadioGroup>
            <DropdownMenu.Separator className="theme-menu-separator" />
            <DropdownMenu.Label className="theme-menu-label">
              主题风格
            </DropdownMenu.Label>
            <DropdownMenu.RadioGroup
              aria-label="主题风格"
              value={appearance}
              onValueChange={(value) => setAppearance(value as Appearance)}
            >
              {appearances.map(({ value, label, description: detail }) => (
                <DropdownMenu.RadioItem
                  key={value}
                  value={value}
                  aria-label={label}
                  className="theme-menu-item theme-style-item"
                >
                  <span
                    className={`theme-style-swatch ${value}`}
                    aria-hidden="true"
                  />
                  <span className="theme-style-description">
                    <span>{label}</span>
                    <small>{detail}</small>
                  </span>
                  <DropdownMenu.ItemIndicator className="theme-menu-check">
                    <Check size={15} aria-hidden="true" />
                  </DropdownMenu.ItemIndicator>
                </DropdownMenu.RadioItem>
              ))}
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {error && (
        <p className="banner warning theme-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
