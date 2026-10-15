import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Discover from "./Discover";
import Extract from "./Extract";
import { parseDiscoverStatus } from "./discover/api";
import { formatAuthors, papersCsv, parseSeeds, spreadsheetSafe } from "./discover/format";
import { PAGE_SIZE } from "./discover/DiscoverResults";
import { POLL_INTERVAL_MS } from "./discover/useDiscovery";
import { DEFAULT_EXTRACT_API_URL } from "./extract/config";

const API = DEFAULT_EXTRACT_API_URL;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function paper(n: number, extra: Record<string, unknown> = {}) {
  return {
    title: `Paper ${n}`,
    authors: ["A. Author", "B. Author"],
    year: 2000 + (n % 20),
    journal: "Solid State Ionics",
    doi: `https://doi.org/10.1000/${n}`,
    pdf: null,
    score: 3,
    reason: "Reports conductivity.",
    description: null,
    openalex: `https://openalex.org/W${n}`,
    ...extra,
  };
}

type Reply = Response | Error;

function fakeServer(submits: Reply[], polls: Reply[] = []) {
  const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const reply = init?.method === "POST" ? submits.shift() : polls.shift();
    if (reply === undefined) return Promise.reject(new Error("no reply scripted"));
    return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Renders the address for tests to read with `address()`. */
function Spy() {
  const location = useLocation();
  return <data data-testid="address" value={location.pathname + location.search} />;
}

const address = () => screen.getByTestId("address").getAttribute("value");

function renderDiscover(initialEntry = "/discover") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/discover"
          element={
            <>
              <Discover />
              <Spy />
            </>
          }
        />
        <Route path="/extract" element={<Extract />} />
      </Routes>
    </MemoryRouter>,
  );
}

function submit(keywords = "PEO LiTFSI conductivity") {
  fireEvent.change(screen.getByLabelText("Keywords"), { target: { value: keywords } });
  fireEvent.click(screen.getByRole("button", { name: "Find papers" }));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Discover page", () => {
  it("needs keywords before it searches", () => {
    renderDiscover();
    expect(screen.getByRole("button", { name: "Find papers" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Keywords"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Find papers" })).toBeDisabled();
  });

  it("sends keywords, seeds and features, shows progress, then the papers", async () => {
    const fetchMock = fakeServer(
      [json({ job: "s1" }, 202)],
      [
        json({
          status: "running",
          progress: { candidates: 1200, judged: 400, likely: 90, seconds: 60 },
        }),
        json({ status: "done", papers: [paper(1, { pdf: "https://x/1.pdf" }), paper(2)] }),
      ],
    );
    renderDiscover();
    fireEvent.change(screen.getByLabelText(/Papers you already have/), {
      target: { value: "10.1021/ma00103a034\n\n  A title  " },
    });
    fireEvent.change(screen.getByLabelText(/Data you want/), {
      target: { value: "Tg, conductivity" },
    });
    submit();
    await wait(0);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${API}/discover`);
    expect(JSON.parse(init!.body as string)).toEqual({
      keywords: "PEO LiTFSI conductivity",
      seeds: ["10.1021/ma00103a034", "A title"],
      features: ["Tg", "conductivity"],
    });
    expect(screen.getByRole("status")).toHaveTextContent("Finding papers");

    await wait(POLL_INTERVAL_MS);
    expect(screen.getByText("1,200")).toBeInTheDocument();

    await wait(POLL_INTERVAL_MS);
    expect(fetchMock.mock.calls[2]![0]).toBe(`${API}/discover/s1`);
    const list = screen.getByRole("list", { name: /Papers found/ });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent("2 papers likely to report the data");

    fireEvent.click(screen.getByLabelText(/Only papers with an open-access PDF/));
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
  });

  it("shows a page of papers at a time", async () => {
    const papers = Array.from({ length: PAGE_SIZE + 5 }, (_, i) => paper(i));
    fakeServer([json({ job: "s1" }, 202)], [json({ status: "done", papers })]);
    renderDiscover();
    submit();
    await wait(0);
    await wait(POLL_INTERVAL_MS);

    const list = screen.getByRole("list", { name: /Papers found/ });
    expect(within(list).getAllByRole("listitem")).toHaveLength(PAGE_SIZE);
    fireEvent.click(screen.getByRole("button", { name: /Show 5 more/ }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(PAGE_SIZE + 5);
  });

  it("says why a search failed, and can start it again", async () => {
    fakeServer(
      [json({ job: "s1" }, 202), json({ job: "s2" }, 202)],
      [json({ status: "failed", error: "OpenAlex's daily budget is used up" })],
    );
    renderDiscover();
    submit();
    await wait(0);
    await wait(POLL_INTERVAL_MS);

    expect(screen.getByText("The search failed")).toBeInTheDocument();
    expect(screen.getByText("OpenAlex's daily budget is used up")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await wait(0);
    expect(screen.getByRole("status")).toHaveTextContent("Finding papers");
  });

  it("carries the features over to the Extract page", async () => {
    fakeServer([json({ job: "s1" }, 202)], [json({ status: "done", papers: [paper(1)] })]);
    renderDiscover();
    fireEvent.change(screen.getByLabelText(/Data you want/), {
      target: { value: "Tg, conductivity" },
    });
    submit();
    await wait(0);
    await wait(POLL_INTERVAL_MS);

    fireEvent.click(screen.getByRole("link", { name: "Extract its data" }));
    expect(screen.getByLabelText("Features")).toHaveValue("Tg, conductivity");
  });

  it("puts a started search's id in the address, and clears it on a new search", async () => {
    fakeServer([json({ job: "s1" }, 202)], [json({ status: "done", papers: [paper(1)] })]);
    renderDiscover();
    submit();
    await wait(0);
    expect(address()).toBe("/discover?job=s1");

    await wait(POLL_INTERVAL_MS);
    expect(address()).toBe("/discover?job=s1");
    fireEvent.click(screen.getByRole("button", { name: "New search" }));
    expect(address()).toBe("/discover");
  });

  it("reopens the search named in the address, with its request from the server", async () => {
    const fetchMock = fakeServer(
      [],
      [
        json({
          status: "done",
          papers: [paper(1)],
          keywords: "PEO LiTFSI",
          features: ["Tg"],
          started: 1700000000,
        }),
      ],
    );
    renderDiscover("/discover?job=s9");
    await wait(0); // a reopened search is checked at once

    expect(fetchMock.mock.calls[0]![0]).toBe(`${API}/discover/s9`);
    expect(screen.getByRole("list", { name: "Papers found for PEO LiTFSI" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Extract its data" }));
    expect(screen.getByLabelText("Features")).toHaveValue("Tg");
  });

  it("says a reopened search the server lost can't be retried", async () => {
    fakeServer([], [json({ detail: "No such search." }, 404)]);
    renderDiscover("/discover?job=s9");
    await wait(0);

    expect(screen.getByText("The server lost this search")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});

describe("discover helpers", () => {
  it("reads seeds one per line", () => {
    expect(parseSeeds(" a \n\n b\n")).toEqual(["a", "b"]);
  });

  it("shortens long author lists", () => {
    expect(formatAuthors([])).toBe("Authors unknown");
    expect(formatAuthors(["A", "B"])).toBe("A, B");
    expect(formatAuthors(["A", "B", "C", "D"])).toBe("A, B, C et al.");
  });

  it("writes the papers as CSV", () => {
    const csv = papersCsv(
      [parseDiscoverStatus({ status: "done", papers: [paper(1)] })!].flatMap((s) =>
        s.status === "done" ? s.papers : [],
      ),
    );
    expect(csv.split("\r\n")[0]).toBe(
      "title,authors,year,journal,doi,pdf,score,reason,description",
    );
    expect(csv).toContain("Paper 1,A. Author; B. Author,2001");
  });

  it("keeps text from running as a spreadsheet formula", () => {
    expect(spreadsheetSafe("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(spreadsheetSafe("-1 + 1")).toBe("'-1 + 1");
    expect(spreadsheetSafe("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(spreadsheetSafe("Ionic conductivity of PEO")).toBe("Ionic conductivity of PEO");
    expect(spreadsheetSafe(null)).toBeNull();
    const csv = papersCsv(
      [parseDiscoverStatus({ status: "done", papers: [paper(1, { title: "=cmd()" })] })!].flatMap(
        (s) => (s.status === "done" ? s.papers : []),
      ),
    );
    expect(csv.split("\r\n")[1]).toMatch(/^'=cmd\(\),/);
  });

  it("refuses answers that aren't a search status", () => {
    expect(parseDiscoverStatus({ status: "done", papers: [{ title: "no id" }] })).toBeNull();
    expect(parseDiscoverStatus({ status: "done" })).toBeNull();
    expect(parseDiscoverStatus({ status: "running" })).toEqual({
      status: "running",
      progress: null,
    });
  });
});
