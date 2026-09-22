import { describe, expect, it } from "vitest";
import { slugifyHeader } from "./slugify";

describe("slugifyHeader", () => {
  it("lowercases a simple single-word header", () => {
    expect(slugifyHeader("Tg")).toBe("tg");
    expect(slugifyHeader("Polymer")).toBe("polymer");
  });

  it("camelCases multi-word headers", () => {
    expect(slugifyHeader("Polymer family")).toBe("polymerFamily");
    expect(slugifyHeader("Solvent used")).toBe("solventUsed");
    expect(slugifyHeader("drying time (h)")).toBe("dryingTimeH");
  });

  it("strips punctuation that isn't a word boundary", () => {
    expect(slugifyHeader("crystalline?")).toBe("crystalline");
    expect(slugifyHeader("approxMW(kDa)")).toBe("approxMWKDa");
    expect(slugifyHeader("Li:functional group")).toBe("liFunctionalGroup");
    expect(slugifyHeader("Conductivity at 30C")).toBe("conductivityAt30C");
  });

  it("keeps whole-word acronyms intact instead of mangling their case", () => {
    expect(slugifyHeader("DOI")).toBe("doi");
    expect(slugifyHeader("SMILES descriptor 1")).toBe("smilesDescriptor1");
    expect(slugifyHeader("Comonomer1 MW")).toBe("comonomer1MW");
    expect(slugifyHeader("VFT activation energy (K)")).toBe("vftActivationEnergyK");
  });

  it("handles nested parentheses by treating all bracket-like punctuation as a boundary", () => {
    expect(slugifyHeader("VFT prefactor (S/cm*T^(1/2))")).toBe("vftPrefactorSCmT12");
  });

  it("produces 69 unique ids for the real 41+22+9 column set", () => {
    const plottable = [
      "approxTg",
      "Tg",
      "approxMW(kDa)",
      "Li:functional group",
      "Conductivity at 30C",
      "Conductivity at 60C",
      "Conductivity at 90C",
      "Comonomer1 apol",
      "Comonomer1 Vabc",
      "Comonomer1 MW",
      "Comonomer1 ETA_eta_F",
      "Comonomer1 AETA_eta_FL",
      "Comonomer1 AETA_eta_RL",
      "Comonomer2 apol",
      "Comonomer2 Vabc",
      "Comonomer2 MW",
      "Comonomer2 AETA_eta_F",
      "Comonomer2 AETA_dBeta",
      "Comonomer2 ETA_epsilon_1",
      "Comonomer2 ETA_dBeta",
      "Comonomer2 ETA_dAlpha_B",
      "anion apol",
      "anion Vabc",
      "anion nHBAcc",
      "anion nO",
      "anion AETA_alpha",
      "anion ETA_shape_x",
      "Arrhenius Ea (eV)",
      "VFT activation energy (K)",
      "VFT activation energy with fixed T0 (K)",
      "Arrhenius prefactor (S/cm)",
      "VFT prefactor (S/cm*T^(1/2))",
      "VFT prefactor with set T0",
      "Transference number",
      "drying temp",
      "drying time (h)",
      "Polymer family",
      "Polymer",
      "Anion",
      "crystalline?",
      "Solvent used",
    ];
    const conductivityCols = [0, 15, 20, 21, 25, 27, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 100, 110, 125].map(
      (t) => `Conductivity at ${t}C`,
    );
    const extra = [
      "DOI",
      "Reference",
      "Notes",
      "SMILES descriptor 1",
      "SMILES descriptor 2",
      "Tg polymer without salt",
      "Polymer Mn (kDa)",
      "Polymer Mw (kDa)",
      "Comonomer percentage",
    ];
    const all = [...new Set([...plottable, ...conductivityCols, ...extra])];
    expect(all).toHaveLength(69);

    const ids = all.map(slugifyHeader);
    expect(new Set(ids).size).toBe(69);
  });
});
