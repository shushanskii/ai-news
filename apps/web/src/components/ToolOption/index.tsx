import type { AgentTool } from "@app/shared";
import { memo } from "react";
import styled from "styled-components";

const Option = styled.label<{ $checked: boolean }>`
  align-items: center;
  border: 1px solid #d6dae1;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  gap: 8px;
  padding: 7px 10px;
  user-select: none;

  /* The transient flag is for the styling only; a "checked" attribute on a label would be a
     claim the DOM has no meaning for. */
  border-color: ${(props) => (props.$checked ? "#2563eb" : "#d6dae1")};
  background-color: ${(props) => (props.$checked ? "#eff6ff" : "#ffffff")};
`;

const Hint = styled.span`
  color: #6b7280;
  font-size: 12px;
`;

interface ToolOptionProps {
  readonly tool: AgentTool;
  readonly label: string;
  readonly hint: string;
  readonly checked: boolean;
  readonly onToggle: (tool: AgentTool) => void;
}

/**
 * One retrieval tool the user may switch on.
 *
 * A component rather than a `<label>` inside the form's `.map()` because the change handler belongs
 * to the row that owns the checkbox (`conventions/react.md`), and the form then passes one stable
 * callback down instead of building a closure per render per row.
 */
export const ToolOption = memo(function ToolOption({
  tool,
  label,
  hint,
  checked,
  onToggle,
}: ToolOptionProps) {
  function handleChange() {
    onToggle(tool);
  }

  return (
    <Option $checked={checked}>
      <input checked={checked} onChange={handleChange} type="checkbox" />
      {label}
      <Hint>{hint}</Hint>
    </Option>
  );
});
