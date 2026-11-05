import "@testing-library/jest-dom/vitest";
import "jest-styled-components";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
