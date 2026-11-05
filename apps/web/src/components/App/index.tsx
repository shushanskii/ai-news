import { useEffect } from "react";
import styled from "styled-components";
import { TodoForm } from "#components/TodoForm";
import { TodoList } from "#components/TodoList";
import { useTodos } from "#hooks/useTodos";

// The one element that is layout rather than domain: a column that holds the form, the counter and
// the list together. Everything it styles is a child's problem in its own component.
const Page = styled.main`
  background-color: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
  margin: 40px auto;
  max-width: 640px;
  padding: 24px 28px 32px;
`;

export function App() {
  const { todos, remaining, loading, error, filter, actions } = useTodos();

  useEffect(() => {
    actions.load();
  }, [actions]);

  // The control reads its own state back through the hook, so a reload from elsewhere cannot leave
  // the button saying the opposite of what is on screen.
  const overdue = filter.overdue === true;

  function handleToggleOverdue() {
    actions.load(overdue ? {} : { overdue: true });
  }

  if (loading) {
    return (
      <Page>
        <p>Loading…</p>
      </Page>
    );
  }

  return (
    <Page>
      <TodoForm onSubmit={actions.create} />
      {error === undefined ? null : <p role="alert">{error}</p>}
      <button onClick={handleToggleOverdue} type="button">
        {overdue ? "show all" : "show overdue"}
      </button>
      {/* `remaining` counts what is on screen, so under the filter that number is not "left". */}
      <p>{overdue ? `${todos.length} overdue` : `${remaining} left`}</p>
      <TodoList onRemove={actions.remove} onToggle={actions.toggle} todos={todos} />
    </Page>
  );
}
