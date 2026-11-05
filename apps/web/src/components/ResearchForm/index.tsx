import { AgentTool, type ResearchRequest } from "@app/shared";
import { type ChangeEvent, type FormEvent, useState } from "react";
import styled from "styled-components";
import { ToolOption } from "#components/ToolOption";

// The tools the service has, in the order they are worth reaching for. The hint names the backing
// service because that is what a failing run names in its error, and the reader has to be able to
// connect the two.
const TOOLS: readonly { tool: AgentTool; label: string; hint: string }[] = [
  { tool: AgentTool.Search, label: "Поиск", hint: "SearXNG" },
  { tool: AgentTool.Read, label: "Чтение страниц", hint: "Crawl4AI" },
];

// The same floor the request schema enforces. Kept here so the button says "not yet" instead of
// sending a prompt the service will refuse.
const MIN_PROMPT = 3;

const Form = styled.form`
  display: grid;
  gap: 14px;
`;

const Field = styled.label`
  color: #4b5563;
  display: grid;
  font-size: 13px;
  gap: 6px;
`;

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 14px;

  ${Field} {
    flex: 1 1 180px;
  }
`;

// A fieldset, not a label: a `<label>` cannot wrap two controls, and doing it anyway gives every
// checkbox inside it the caption of the whole group as part of its accessible name — which is how
// one checkbox ends up named after the other.
const Group = styled.fieldset`
  border: none;
  color: #4b5563;
  display: grid;
  font-size: 13px;
  gap: 6px;
  margin: 0;
  padding: 0;
`;

const Legend = styled.legend`
  color: #4b5563;
  font-size: 13px;
  padding: 0;
`;

const Tools = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
`;

const Notice = styled.p`
  color: #b42318;
  font-size: 13px;
  margin: 0;
`;

export interface ResearchFormProps {
  readonly running: boolean;
  readonly onSubmit: (request: ResearchRequest) => void;
}

/**
 * The whole input of the agent, on screen: the prompt, the instructions, and which tools it may
 * use. Nothing here is validated twice — the schema on the server decides what a legal request is,
 * and this only stops the obvious ones from costing a round trip.
 */
export function ResearchForm({ running, onSubmit }: ResearchFormProps) {
  const [prompt, setPrompt] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [tools, setTools] = useState<readonly AgentTool[]>([AgentTool.Search, AgentTool.Read]);
  const [maxSources, setMaxSources] = useState(8);
  const [language, setLanguage] = useState("");

  const trimmed = prompt.trim();
  const canSubmit = !running && trimmed.length >= MIN_PROMPT && tools.length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    const system = systemPrompt.trim();

    onSubmit({
      prompt: trimmed,
      ...(system === "" ? {} : { systemPrompt: system }),
      // Copied: the request is handed to a saga and then to a fetch, and the form's own state must
      // not be the same array somebody else might reorder.
      tools: [...tools],
      maxSources,
      ...(language === "" ? {} : { language }),
    });
  }

  function handlePromptChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setPrompt(event.target.value);
  }

  function handleSystemPromptChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setSystemPrompt(event.target.value);
  }

  function handleToggleTool(tool: AgentTool) {
    setTools((current) =>
      current.includes(tool) ? current.filter((one) => one !== tool) : [...current, tool],
    );
  }

  function handleMaxSourcesChange(event: ChangeEvent<HTMLInputElement>) {
    setMaxSources(Number(event.target.value));
  }

  function handleLanguageChange(event: ChangeEvent<HTMLSelectElement>) {
    setLanguage(event.target.value);
  }

  return (
    <Form onSubmit={handleSubmit}>
      <Field>
        Тема
        <textarea
          onChange={handlePromptChange}
          placeholder="например: что произошло с ценами на SSD за последнюю неделю"
          rows={3}
          value={prompt}
        />
      </Field>

      <Field>
        Системный промпт
        <textarea
          onChange={handleSystemPromptChange}
          placeholder="необязательно: чем агент должен отличаться от обычного"
          rows={2}
          value={systemPrompt}
        />
      </Field>

      <Group>
        <Legend>Инструменты</Legend>
        <Tools>
          {TOOLS.map((option) => (
            <ToolOption
              checked={tools.includes(option.tool)}
              hint={option.hint}
              key={option.tool}
              label={option.label}
              onToggle={handleToggleTool}
              tool={option.tool}
            />
          ))}
        </Tools>
      </Group>

      <Row>
        <Field>
          Источников не больше
          <input
            max={20}
            min={1}
            onChange={handleMaxSourcesChange}
            type="number"
            value={maxSources}
          />
        </Field>

        <Field>
          Язык ответа
          <select onChange={handleLanguageChange} value={language}>
            <option value="">как в запросе</option>
            <option value="ru">русский</option>
            <option value="en">английский</option>
          </select>
        </Field>
      </Row>

      {tools.length === 0 ? (
        <Notice>Без инструментов агенту нечем искать — оставьте хотя бы один.</Notice>
      ) : null}

      <button disabled={!canSubmit} type="submit">
        {running ? "Ищу…" : "Искать новости"}
      </button>
    </Form>
  );
}
