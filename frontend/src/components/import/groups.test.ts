import { describe, expect, it } from "vitest";
import { rankOf } from "@/data";
import { groupImportedByCategory } from "./groups";

interface Row {
  id: number;
  anion: string | null;
}

const rows = (anions: (string | null)[]): Row[] => anions.map((anion, id) => ({ id, anion }));
const labels = (groups: { label: string | null }[]) => groups.map((group) => group.label);

describe("groupImportedByCategory", () => {
  it("orders categories as the dataset's legend does, whatever order the file uses", () => {
    // The dataset ranks TFSI before CF3SO3 before ClO4.
    expect(rankOf("anion", "TFSI")).toBeLessThan(rankOf("anion", "CF3SO3"));
    expect(rankOf("anion", "CF3SO3")).toBeLessThan(rankOf("anion", "ClO4"));

    const groups = groupImportedByCategory(
      rows(["ClO4", "TFSI", "CF3SO3", "TFSI"]),
      "anion",
      (row) => row.anion,
    );
    expect(labels(groups)).toEqual(["TFSI", "CF3SO3", "ClO4"]);
    expect(groups[0].items.map((row) => row.id)).toEqual([1, 3]);
  });

  it("puts categories the dataset doesn't have next, in file order, and blank rows last", () => {
    const groups = groupImportedByCategory(
      rows([null, "NewAnionB", "TFSI", "NewAnionA", null]),
      "anion",
      (row) => row.anion,
    );
    expect(labels(groups)).toEqual(["TFSI", "NewAnionB", "NewAnionA", null]);
    expect(groups[3].items.map((row) => row.id)).toEqual([0, 4]);
  });

  it("returns one unlabelled group when no row has a value", () => {
    const groups = groupImportedByCategory(rows([null, null]), "anion", (row) => row.anion);
    expect(groups).toEqual([{ label: null, items: rows([null, null]) }]);
  });

  it("returns nothing for no rows", () => {
    expect(groupImportedByCategory([], "anion", () => null)).toEqual([]);
  });

  it("keeps file order for a column with no dataset ranking", () => {
    const groups = groupImportedByCategory(rows(["b", "a", "b"]), "notes", (row) => row.anion);
    expect(labels(groups)).toEqual(["b", "a"]);
  });
});
