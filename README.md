# polymerData

Monorepo for the polymer electrolyte data project: paper extraction, data
pipelines, and the frontend explorer.

- [`extraction/`](extraction/) — parses uploaded papers (text, tables, figures) with MinerU,
  sends the parsed content to an LLM to extract structured data, and scores
  results against the golden dataset (`extraction/data/_Cleaned_Final_Data_6_2_2020.csv`).
- [`frontend/`](frontend/) — the client-side app that visualizes the polymer-electrolyte
  conductivity dataset (a rebuild of pedatamine.org).

Each subdirectory keeps its own README with setup and usage instructions.
