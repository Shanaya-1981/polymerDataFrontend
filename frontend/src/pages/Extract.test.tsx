import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadCsv } from "@/lib/csv-export";
import Extract from "./Extract";
import { DEFAULT_EXTRACT_API_URL } from "./extract/config";
import { POLL_INTERVAL_MS } from "./extract/useExtraction";

vi.mock("@/lib/csv-export", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/csv-export")>()),
  downloadCsv: vi.fn(),
}));

// No VITE_EXTRACT_API_URL is set under test, so the page uses the default.
const API = DEFAULT_EXTRACT_API_URL;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const SAMPLES = {
  "Amorphous PEO (undoped)": [
    { "Temperature (°C)": 20, "Conductivity (S/cm)": 1e-7 },
    { "Temperature (°C)": 25, "Conductivity (S/cm)": 2.82e-7 },
  ],
  "Amorphous PEO:LiClO4 - 64:1": [{ "Temperature (°C)": 20, "Conductivity (S/cm)": null }],
};

type Reply = Response | Error;

/** Each POST takes the next of `submits`, each status check the next of `polls`. */
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

/** The page's address, shown so tests can read it. */
function Address() {
  const { pathname, search } = useLocation();
  return <div data-testid="address">{pathname + search}</div>;
}

function renderExtract(address = "/extract") {
  return render(
    <MemoryRouter initialEntries={[address]}>
      <Extract />
      <Address />
    </MemoryRouter>,
  );
}

const address = () => screen.getByTestId("address").textContent;

function choosePdf(name = "linden1988.pdf") {
  const file = new File(["%PDF-1.4 fake"], name, { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText("PDF file"), { target: { files: [file] } });
}

function typeFeatures(text: string) {
  fireEvent.change(screen.getByLabelText("Features"), { target: { value: text } });
}

function submitButton() {
  return screen.getByRole("button", { name: "Extract data" });
}

async function submitAndStart() {
  choosePdf();
  typeFeatures("Temperature (°C), Conductivity (S/cm)");
  fireEvent.click(submitButton());
  await wait(0);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.mocked(downloadCsv).mockClear();
});

describe("Extract page — the form", () => {
  it("keeps Extract data disabled until there's a PDF and at least one feature", () => {
    renderExtract();
    expect(submitButton()).toBeDisabled();

    choosePdf();
    expect(screen.getByText(/linden1988\.pdf/)).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();

    typeFeatures(" , ,");
    expect(submitButton()).toBeDisabled();

    typeFeatures("Temperature (°C), Conductivity (S/cm)");
    expect(submitButton()).toBeEnabled();
  });

  it("previews the feature names exactly as the server will split them", () => {
    renderExtract();
    typeFeatures(" Tg ,, Conductivity (S/cm) ");
    const list = screen.getByRole("list", { name: "Features to extract" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Tg", "Conductivity (S/cm)"]);
  });

  it("says which server the PDF goes to", () => {
    renderExtract();
    expect(screen.getByText(API)).toBeInTheDocument();
  });
});

describe("Extract page — running and results", () => {
  it("sends the PDF, shows progress while the job runs, then shows each sample's table", async () => {
    const fetchMock = fakeServer(
      [json({ job: "abc" }, 202)],
      [json({ status: "running" }), json({ status: "done", samples: SAMPLES })],
    );
    renderExtract();
    await submitAndStart();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API}/extract`);
    expect((init?.body as FormData).get("features")).toBe("Temperature (°C), Conductivity (S/cm)");

    expect(
      screen.getByText("Extracting data… this may take a few minutes", { exact: false }),
    ).toBeInTheDocument();
    await wait(POLL_INTERVAL_MS);
    expect(screen.getByText(/0:03 elapsed/)).toBeInTheDocument();
    await wait(POLL_INTERVAL_MS);

    expect(screen.getByRole("status")).toHaveTextContent(
      "2 samples · 3 data points from linden1988.pdf",
    );
    const first = screen.getByRole("region", { name: "Amorphous PEO (undoped)" });
    const table = within(first).getByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Temperature (°C)", "Conductivity (S/cm)"]);
    expect(
      within(table)
        .getAllByRole("row")
        .slice(1)
        .map((row) =>
          within(row)
            .getAllByRole("cell")
            .map((cell) => cell.textContent),
        ),
    ).toEqual([
      ["20", "1e-7"],
      ["25", "2.82e-7"],
    ]);

    const second = screen.getByRole("region", { name: "Amorphous PEO:LiClO4 - 64:1" });
    expect(within(second).getByText("not given")).toBeInTheDocument();
  });

  it("says so when the paper gave no samples", async () => {
    fakeServer([json({ job: "abc" }, 202)], [json({ status: "done", samples: {} })]);
    renderExtract();
    await submitAndStart();
    await wait(POLL_INTERVAL_MS);
    expect(screen.getByText("No samples found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download CSV" })).not.toBeInTheDocument();
  });

  it("Download CSV saves the results as a CSV named after the PDF", async () => {
    fakeServer([json({ job: "abc" }, 202)], [json({ status: "done", samples: SAMPLES })]);
    renderExtract();
    await submitAndStart();
    await wait(POLL_INTERVAL_MS);

    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    expect(downloadCsv).toHaveBeenCalledWith(
      "linden1988-extracted.csv",
      [
        "sample,Temperature (°C),Conductivity (S/cm)",
        "Amorphous PEO (undoped),20,1e-7",
        "Amorphous PEO (undoped),25,2.82e-7",
        "Amorphous PEO:LiClO4 - 64:1,20,",
      ].join("\r\n"),
    );
  });

  it("New extraction goes back to the form, clearing the file but keeping the features", async () => {
    fakeServer([json({ job: "abc" }, 202)], [json({ status: "done", samples: SAMPLES })]);
    renderExtract();
    await submitAndStart();
    await wait(POLL_INTERVAL_MS);

    fireEvent.click(screen.getByRole("button", { name: "New extraction" }));

    expect(screen.getByText("No file chosen")).toBeInTheDocument();
    expect(screen.getByLabelText("Features")).toHaveValue("Temperature (°C), Conductivity (S/cm)");
    expect(submitButton()).toBeDisabled();
  });

  it("New extraction while a job runs stops checking on it", async () => {
    const fetchMock = fakeServer([json({ job: "abc" }, 202)], [json({ status: "running" })]);
    renderExtract();
    await submitAndStart();

    fireEvent.click(screen.getByRole("button", { name: "New extraction" }));
    await wait(POLL_INTERVAL_MS * 5);

    expect(submitButton()).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Extract page — errors", () => {
  it("shows the server's reason for refusing a file, and only offers to change the inputs", async () => {
    fakeServer([json({ detail: "The uploaded file isn't a PDF." }, 400)]);
    renderExtract();
    await submitAndStart();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("The server couldn't start this extraction");
    expect(alert).toHaveTextContent("The uploaded file isn't a PDF.");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Change file or features" }));
    expect(screen.getByText(/linden1988\.pdf/)).toBeInTheDocument();
    expect(screen.getByLabelText("Features")).toHaveValue("Temperature (°C), Conductivity (S/cm)");
    expect(submitButton()).toBeEnabled();
  });

  it("explains an unreachable server, and Try again sends the request again", async () => {
    const fetchMock = fakeServer([new TypeError("Failed to fetch"), json({ job: "abc" }, 202)]);
    renderExtract();
    await submitAndStart();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Couldn't reach the extraction server");
    expect(alert).toHaveTextContent(API);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await wait(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      screen.getByText("Extracting data… this may take a few minutes", { exact: false }),
    ).toBeInTheDocument();
  });

  it("shows why a job failed", async () => {
    fakeServer(
      [json({ job: "abc" }, 202)],
      [json({ status: "failed", error: "claude: usage limit reached" })],
    );
    renderExtract();
    await submitAndStart();
    await wait(POLL_INTERVAL_MS);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("The extraction failed");
    expect(alert).toHaveTextContent("claude: usage limit reached");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("explains a job the server no longer has", async () => {
    fakeServer(
      [json({ job: "abc" }, 202)],
      [json({ detail: "No such job. A job still running when the server stopped is lost." }, 404)],
    );
    renderExtract();
    await submitAndStart();
    await wait(POLL_INTERVAL_MS);

    expect(screen.getByRole("alert")).toHaveTextContent("The server lost this extraction");
  });

  it("explains an answer that isn't the extraction server's", async () => {
    fakeServer([new Response("<!doctype html><title>Something else</title>", { status: 200 })]);
    renderExtract();
    await submitAndStart();

    expect(screen.getByRole("alert")).toHaveTextContent("The server's answer couldn't be read");
  });
});

describe("Extract page — the address", () => {
  const DETAILS = {
    file: "linden1988.pdf",
    features: ["Temperature (°C)", "Conductivity (S/cm)"],
    started: 1_790_000_000,
  };

  it("puts the job in the address once it starts, and takes it out for New extraction", async () => {
    fakeServer([json({ job: "abc" }, 202)], [json({ status: "done", samples: SAMPLES })]);
    renderExtract();
    expect(address()).toBe("/extract");

    await submitAndStart();
    expect(address()).toBe("/extract?job=abc");
    await wait(POLL_INTERVAL_MS);
    expect(address()).toBe("/extract?job=abc");

    fireEvent.click(screen.getByRole("button", { name: "New extraction" }));
    expect(address()).toBe("/extract");
  });

  it("shows a finished job's results when opened at its address, without sending anything", async () => {
    const fetchMock = fakeServer([], [json({ status: "done", samples: SAMPLES, ...DETAILS })]);
    renderExtract("/extract?job=abc");
    await wait(0);

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      [`${API}/extract/abc`, undefined],
    ]);
    expect(screen.getByRole("status")).toHaveTextContent(
      "2 samples · 3 data points from linden1988.pdf",
    );
    expect(address()).toBe("/extract?job=abc");
  });

  it("shows a running job's progress when opened at its address, timed from when it started", async () => {
    vi.setSystemTime(DETAILS.started * 1000 + 90_000);
    fakeServer(
      [],
      [
        json({ status: "running", ...DETAILS }),
        json({ status: "done", samples: SAMPLES, ...DETAILS }),
      ],
    );
    renderExtract("/extract?job=abc");
    await wait(0);

    expect(screen.getByText("linden1988.pdf")).toBeInTheDocument();
    expect(screen.getByText(/1:30 elapsed/)).toBeInTheDocument();
    await wait(POLL_INTERVAL_MS);
    expect(screen.getByRole("status")).toHaveTextContent("2 samples · 3 data points");
  });

  it("can't start a job opened from its address over, since the page doesn't have its PDF", async () => {
    fakeServer([], [json({ status: "failed", error: "claude: usage limit reached", ...DETAILS })]);
    renderExtract("/extract?job=abc");
    await wait(0);

    expect(screen.getByRole("alert")).toHaveTextContent("claude: usage limit reached");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Change file or features" }));
    expect(screen.getByText("No file chosen")).toBeInTheDocument();
    expect(screen.getByLabelText("Features")).toHaveValue("Temperature (°C), Conductivity (S/cm)");
    expect(address()).toBe("/extract");
  });

  it("explains an address naming a job the server doesn't have", async () => {
    fakeServer([], [json({ detail: "No such job." }, 404)]);
    renderExtract("/extract?job=gone");
    await wait(0);

    expect(screen.getByRole("alert")).toHaveTextContent("The server lost this extraction");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});
