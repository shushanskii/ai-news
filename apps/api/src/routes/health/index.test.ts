import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "#app";

describe("GET /health", () => {
  it("answers 200 with a body", async () => {
    const response = await request(createApp()).get("/health");

    // The assertion is the status, not the body: a probe is told ready by 200 and reads nothing.
    // The body is here so the response is JSON like every other answer this service gives.
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});
