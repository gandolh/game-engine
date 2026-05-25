import { createEl, applyStyles } from "./dom";

export type ConfigField =
  | { key: string; label: string; type: "number"; min: number; max: number; step: number; default: number }
  | { key: string; label: string; type: "boolean"; default: boolean }
  | { key: string; label: string; type: "enum"; options: string[]; default: string };

export type ConfigSchema = ReadonlyArray<ConfigField>;

type FieldValue = number | boolean | string;

const PANEL_STYLES: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  top: "0",
  left: "0",
  width: "240px",
  background: "#1a1a1a",
  color: "#e0e0e0",
  fontFamily: "monospace",
  fontSize: "12px",
  zIndex: "9999",
  borderRight: "1px solid #333",
};

const HEADER_STYLES: Partial<CSSStyleDeclaration> = {
  cursor: "pointer",
  padding: "8px",
  background: "#222",
  fontWeight: "bold",
  fontSize: "13px",
  color: "#fff",
  userSelect: "none",
  borderBottom: "1px solid #333",
};

const BODY_STYLES: Partial<CSSStyleDeclaration> = {
  padding: "8px",
  maxHeight: "80vh",
  overflowY: "auto",
};

const FIELD_ROW_STYLES: Partial<CSSStyleDeclaration> = {
  display: "flex",
  flexDirection: "column",
  marginBottom: "8px",
};

const LABEL_STYLES: Partial<CSSStyleDeclaration> = {
  marginBottom: "2px",
  color: "#aaa",
  fontSize: "11px",
};

const INPUT_STYLES: Partial<CSSStyleDeclaration> = {
  background: "#2a2a2a",
  color: "#e0e0e0",
  border: "1px solid #444",
  borderRadius: "3px",
  padding: "2px 4px",
  fontFamily: "monospace",
  fontSize: "12px",
  width: "100%",
  boxSizing: "border-box",
};

const RESET_STYLES: Partial<CSSStyleDeclaration> = {
  marginTop: "8px",
  padding: "4px 8px",
  background: "#333",
  color: "#e0e0e0",
  border: "1px solid #555",
  borderRadius: "3px",
  cursor: "pointer",
  fontFamily: "monospace",
  fontSize: "12px",
  width: "100%",
};

export class ConfigPanel {
  private panel: HTMLElement;
  private body: HTMLElement;
  private collapsed = false;

  /** Maps key -> current input element for reset */
  private inputs = new Map<string, HTMLInputElement | HTMLSelectElement>();

  constructor(
    parent: HTMLElement,
    private schema: ConfigSchema,
    private onChange: (key: string, value: FieldValue) => void,
  ) {
    this.panel = createEl("div");
    applyStyles(this.panel, PANEL_STYLES);

    const header = createEl("div", { text: "Config" });
    applyStyles(header, HEADER_STYLES);
    header.addEventListener("click", () => this.toggleCollapse());
    this.panel.appendChild(header);

    this.body = createEl("div");
    applyStyles(this.body, BODY_STYLES);

    for (const field of schema) {
      this.buildFieldRow(field);
    }

    const resetBtn = createEl("button", { text: "Reset to defaults" });
    applyStyles(resetBtn, RESET_STYLES);
    resetBtn.addEventListener("click", () => this.resetAll());
    this.body.appendChild(resetBtn);

    this.panel.appendChild(this.body);
    parent.appendChild(this.panel);
  }

  private buildFieldRow(field: ConfigField): void {
    const row = createEl("div");
    applyStyles(row, FIELD_ROW_STYLES);

    const label = createEl("label", { text: field.label });
    applyStyles(label, LABEL_STYLES);
    row.appendChild(label);

    if (field.type === "number") {
      const input = createEl("input");
      applyStyles(input, INPUT_STYLES);
      input.type = "number";
      input.min = String(field.min);
      input.max = String(field.max);
      input.step = String(field.step);
      input.value = String(field.default);
      input.addEventListener("input", () => {
        const parsed = parseFloat(input.value);
        if (!isNaN(parsed)) {
          this.onChange(field.key, parsed);
        }
      });
      this.inputs.set(field.key, input);
      row.appendChild(input);
    } else if (field.type === "boolean") {
      const input = createEl("input");
      input.type = "checkbox";
      input.checked = field.default;
      input.addEventListener("change", () => {
        this.onChange(field.key, input.checked);
      });
      this.inputs.set(field.key, input);
      row.appendChild(input);
    } else {
      // enum
      const select = createEl("select");
      applyStyles(select, INPUT_STYLES);
      for (const opt of field.options) {
        const option = createEl("option");
        option.value = opt;
        option.textContent = opt;
        if (opt === field.default) {
          option.selected = true;
        }
        select.appendChild(option);
      }
      select.addEventListener("change", () => {
        this.onChange(field.key, select.value);
      });
      this.inputs.set(field.key, select);
      row.appendChild(select);
    }

    this.body.appendChild(row);
  }

  private toggleCollapse(): void {
    this.collapsed = !this.collapsed;
    this.body.style.display = this.collapsed ? "none" : "";
  }

  private resetAll(): void {
    for (const field of this.schema) {
      const input = this.inputs.get(field.key);
      if (input === undefined) continue;

      if (field.type === "number") {
        (input as HTMLInputElement).value = String(field.default);
        this.onChange(field.key, field.default);
      } else if (field.type === "boolean") {
        (input as HTMLInputElement).checked = field.default;
        this.onChange(field.key, field.default);
      } else {
        (input as HTMLSelectElement).value = field.default;
        this.onChange(field.key, field.default);
      }
    }
  }

  setVisible(v: boolean): void {
    this.panel.style.display = v ? "" : "none";
  }

  destroy(): void {
    this.panel.remove();
    this.inputs.clear();
  }
}
