import type { ResearchRequest, ResearchResult } from "@app/shared";
import { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { researchNews, resetNews } from "#actions/news";
import { selectNewsError, selectNewsResult, selectNewsRunning } from "#selectors/news";
import type { AppDispatch } from "#store";

interface UseNewsActions {
  readonly research: (request: ResearchRequest) => void;
  readonly reset: () => void;
}

interface UseNews {
  readonly result: ResearchResult | undefined;
  readonly running: boolean;
  readonly error: string | undefined;
  readonly actions: UseNewsActions;
}

// Reads through selectors, writes only by dispatching intents from `actions/news`. Slice actions
// are a saga's business; nothing above this line may reach them.
export function useNews(): UseNews {
  const dispatch = useDispatch<AppDispatch>();
  const result = useSelector(selectNewsResult);
  const running = useSelector(selectNewsRunning);
  const error = useSelector(selectNewsError);

  // Memoized once so leaf components can be `memo`-ed with stable refs. Nothing here closes over
  // the result, which is what keeps the reference stable as the data changes.
  const actions = useMemo<UseNewsActions>(
    () => ({
      research: (request: ResearchRequest) => dispatch(researchNews(request)),
      reset: () => dispatch(resetNews()),
    }),
    [dispatch],
  );

  return { result, running, error, actions };
}
