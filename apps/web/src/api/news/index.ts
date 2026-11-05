import {
  apiErrorSchema,
  type ResearchRequest,
  type ResearchResult,
  researchResultSchema,
} from "@app/shared";

// Vite proxies /api to the service in development — see vite.config.ts.
const base = "/api/news";

/**
 * Why the service said no, in the words it used.
 *
 * A research run fails for reasons the reader can act on — "the prompt is too short", "the fetcher
 * refused that host" — and a bare `failed with 400` throws that away. The body is parsed rather
 * than trusted: an HTML error page from a proxy in front of the service is not a JSON envelope, and
 * the status line is the answer that stays true either way.
 */
async function describeFailure(response: Response): Promise<string> {
  const status = `POST ${base} failed with ${response.status}`;

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    return status;
  }

  const parsed = apiErrorSchema.safeParse(body);

  if (!parsed.success) {
    return status;
  }

  const fields = Object.entries(parsed.data.fieldErrors ?? {}).flatMap(([field, messages]) =>
    messages.map((message) => `${field}: ${message}`),
  );

  return fields.length === 0 ? parsed.data.error : `${parsed.data.error} — ${fields.join(", ")}`;
}

// Exported as one object rather than loose functions: `research` is a verb every layer wants, and a
// single named export keeps it from colliding with the intent of the same name in `actions/news`.
export const newsApi = {
  async research(request: ResearchRequest): Promise<ResearchResult> {
    const response = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(await describeFailure(response));
    }

    // The service is a separate process that can be redeployed on its own, so its output is
    // untrusted input until this schema says otherwise.
    return researchResultSchema.parse(await response.json());
  },
};
