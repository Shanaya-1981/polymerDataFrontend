import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Extract from "../Extract";
import type { JobProgress } from "./api";
import { ExtractProgress } from "./ExtractProgress";
import { POLL_INTERVAL_MS } from "./useExtraction";

// Progress feedback (issue #13), from the server's answer to the screen: the
// card on its own, then the page passing each answer's step to it.

const asking: JobProgress = {
  step: "asking",
  name: "Asking the model",
  description: "The model is reading the paper and pulling out each feature.",
  percent: 60,
};

function renderCard(progress?: JobProgress) {
  return render(
    <ExtractProgress
      fileName="linden1988.pdf"
      features={["Temperature (°C)", "Conductivity (S/cm)"]}
      startedAt={Date.now()}
      progress={progress}
      onNewExtraction={() => {}}
    />,
  );
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Each POST takes the next of `submits`, each status check the next of `polls`. */
function fakeServer(submits: Response[], polls: Response[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const reply = init?.method === "POST" ? submits.shift() : polls.shift();
      return reply ? Promise.resolve(reply) : Promise.reject(new Error("no reply scripted"));
    }),
  );
}

async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ExtractProgress", () => {
  it("shows the job's percent as a bar, with the step's name and description", () => {
    renderCard(asking);

    const bar = screen.getByRole("progressbar", { name: "Extraction progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "60");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-valuetext", "Asking the model, 60%");
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Asking the model");
    expect(
      screen.getByText("The model is reading the paper and pulling out each feature."),
    ).toBeInTheDocument();
  });

  it("rounds the percent it shows", () => {
    renderCard({ ...asking, percent: 59.6 });
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "60");
  });

  it("shows activity but no amount until a step is reported", () => {
    renderCard();

    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
    expect(screen.getByRole("status")).toHaveTextContent("Working on it");
    expect(screen.getByText(/a new one about 5 minutes/)).toBeInTheDocument();
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });

  it("keeps the headline and elapsed time", () => {
    renderCard(asking);
    expect(screen.getByText("Extracting data… this may take a few minutes")).toBeInTheDocument();
    expect(screen.getByText("0:00 elapsed")).toBeInTheDocument();
  });
});

describe("Extract page — progress from the server", () => {
  it("moves the bar through each step the server reports, then shows the results", async () => {
    const queued = {
      step: "queued",
      name: "Waiting to start",
      description: "Waiting for 1 earlier extraction to finish. The server runs one at a time.",
      percent: 0,
    };
    fakeServer(
      [json({ job: "abc" }, 202)],
      [
        json({ status: "running", progress: queued }),
        json({ status: "running", progress: asking }),
        json({ status: "done", samples: { PEO: [{ "Temperature (°C)": 20 }] } }),
      ],
    );
    render(
      <MemoryRouter initialEntries={["/extract"]}>
        <Extract />
      </MemoryRouter>,
    );
    const file = new File(["%PDF-1.4 fake"], "linden1988.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("PDF file"), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText("Features"), { target: { value: "Temperature (°C)" } });
    fireEvent.click(screen.getByRole("button", { name: "Extract data" }));
    await wait(0);

    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");

    await wait(POLL_INTERVAL_MS);
    expect(screen.getByRole("status")).toHaveTextContent("Waiting to start");
    expect(screen.getByText(queued.description)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");

    await wait(POLL_INTERVAL_MS);
    expect(screen.getByRole("status")).toHaveTextContent("Asking the model");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "60");

    await wait(POLL_INTERVAL_MS);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 sample · 1 data point");
  });
});
