import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// React Testing Library only auto-registers its afterEach cleanup when Vitest
// runs with `globals: true`. We don't, so unmount explicitly — otherwise every
// render leaks into the next test and `getByRole` starts throwing
// "found multiple elements" as soon as a file has more than one case.
afterEach(cleanup);
