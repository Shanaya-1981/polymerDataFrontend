/**
 * GENERATED FILE — do not edit by hand.
 * Run `npm run build:data` (scripts/build-data.ts) to regenerate.
 *
 * Typed registry for every column in dataset.json: a stable id, display
 * label (the literal source CSV header), unit where meaningful, whether the
 * column is categorical or continuous, which routed pages plot it and which
 * filter by it (they are NOT the same set — see derivePageLookups), as a
 * control (derived from data/reference/ui-controls.json), and a plain-
 * language description where one exists. Only 16 of these 69 columns are
 * also one of the 36 correlation features in
 * data/reference/feature-glossary.json — the other 20 glossary features are
 * forML-only and never appear as a plottable column; they show up solely as
 * labels in correlations.json. Every remaining column's description (this
 * app's own gloss, not part of the verified dataset) comes from
 * scripts/ui-column-descriptions.json instead — see build-data.ts's
 * `descriptionByColumn` for how the two are merged.
 */

export type ColumnKind = "categorical" | "continuous";
export type PageId = "explore" | "temperature";

export interface ColumnMeta {
  readonly id: string;
  readonly label: string;
  readonly unit?: string;
  readonly kind: ColumnKind;
  readonly plottableOn: readonly PageId[];
  readonly filterableOn: readonly PageId[];
  readonly description?: string;
}

export const COLUMNS: readonly ColumnMeta[] = [
  {
    "id": "approxTg",
    "label": "approxTg",
    "unit": "°C",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "Tg of electrolyte or polymer without salt if not given"
  },
  {
    "id": "tg",
    "label": "Tg",
    "unit": "°C",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "Glass transition temperature of the electrolyte (polymer plus dissolved salt) — the temperature below which it stiffens from a rubbery to a glassy state."
  },
  {
    "id": "approxMWKDa",
    "label": "approxMW(kDa)",
    "unit": "kDa",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "Mn where given, else Mw"
  },
  {
    "id": "liFunctionalGroup",
    "label": "Li:functional group",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "Molar ratio of lithium ions to the polymer's coordinating functional groups — how concentrated the dissolved salt is."
  },
  {
    "id": "conductivityAt30C",
    "label": "Conductivity at 30C",
    "unit": "S/cm",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "Ionic conductivity of the electrolyte measured at 30°C."
  },
  {
    "id": "conductivityAt60C",
    "label": "Conductivity at 60C",
    "unit": "S/cm",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "Ionic conductivity of the electrolyte measured at 60°C."
  },
  {
    "id": "conductivityAt90C",
    "label": "Conductivity at 90C",
    "unit": "S/cm",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "Ionic conductivity of the electrolyte measured at 90°C."
  },
  {
    "id": "comonomer1Apol",
    "label": "Comonomer1 apol",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "Atomic polarizability of comonomer 1 — how easily its electron cloud distorts in an electric field."
  },
  {
    "id": "comonomer1Vabc",
    "label": "Comonomer1 Vabc",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "Van der Waals volume of comonomer 1 — an estimate of the molecule's physical size."
  },
  {
    "id": "comonomer1MW",
    "label": "Comonomer1 MW",
    "unit": "g/mol",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "Molecular weight of comonomer 1."
  },
  {
    "id": "comonomer1ETA_eta_F",
    "label": "Comonomer1 ETA_eta_F",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "functionality index - presence of heteroatoms"
  },
  {
    "id": "comonomer1AETA_eta_FL",
    "label": "Comonomer1 AETA_eta_FL",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "averaged local functionality index - presence of heteroatoms"
  },
  {
    "id": "comonomer1AETA_eta_RL",
    "label": "Comonomer1 AETA_eta_RL",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "averaged local reference alkane composite index"
  },
  {
    "id": "comonomer2Apol",
    "label": "Comonomer2 apol",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "Atomic polarizability of comonomer 2 — how easily its electron cloud distorts in an electric field."
  },
  {
    "id": "comonomer2Vabc",
    "label": "Comonomer2 Vabc",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "Van der Waals volume of comonomer 2 — an estimate of the molecule's physical size."
  },
  {
    "id": "comonomer2MW",
    "label": "Comonomer2 MW",
    "unit": "g/mol",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "Molecular weight of comonomer 2."
  },
  {
    "id": "comonomer2AETA_eta_F",
    "label": "Comonomer2 AETA_eta_F",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "averaged functionality index - presence of heteratoms"
  },
  {
    "id": "comonomer2AETA_dBeta",
    "label": "Comonomer2 AETA_dBeta",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "averaged measure of relative unsaturation content"
  },
  {
    "id": "comonomer2ETA_epsilon_1",
    "label": "Comonomer2 ETA_epsilon_1",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "measure of electronegative atom count"
  },
  {
    "id": "comonomer2ETA_dBeta",
    "label": "Comonomer2 ETA_dBeta",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "measure of relative unsaturation content"
  },
  {
    "id": "comonomer2ETA_dAlpha_B",
    "label": "Comonomer2 ETA_dAlpha_B",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "count of hydrogen bond acceptor atoms/polar surface area"
  },
  {
    "id": "anionApol",
    "label": "anion apol",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "Atomic polarizability of the anion — how easily its electron cloud distorts in an electric field."
  },
  {
    "id": "anionVabc",
    "label": "anion Vabc",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "Van der Waals volume of the anion — an estimate of the ion's physical size."
  },
  {
    "id": "anionNHBAcc",
    "label": "anion nHBAcc",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "number hydrogen bond acceptors"
  },
  {
    "id": "anionNO",
    "label": "anion nO",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "number of oxygen atoms"
  },
  {
    "id": "anionAETA_alpha",
    "label": "anion AETA_alpha",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "average core count of a non-hydrogen vertex"
  },
  {
    "id": "anionETA_shape_x",
    "label": "anion ETA_shape_x",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "shape index describes size and shape of monomer"
  },
  {
    "id": "arrheniusEaEV",
    "label": "Arrhenius Ea (eV)",
    "unit": "eV",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "Activation energy for ion transport from a simple Arrhenius fit, in electron-volts — how much energy ions need to start moving through the polymer."
  },
  {
    "id": "vftActivationEnergyK",
    "label": "VFT activation energy (K)",
    "unit": "K",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "Activation-energy-like term from a Vogel-Fulcher-Tammann (VFT) fit, in Kelvin. VFT is used instead of a simple Arrhenius law because conductivity rises faster than Arrhenius predicts as a polymer approaches its glass transition."
  },
  {
    "id": "vftActivationEnergyWithFixedT0K",
    "label": "VFT activation energy with fixed T0 (K)",
    "unit": "K",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "Same VFT activation-energy term, but from a fit where the reference temperature T0 was held fixed rather than allowed to vary freely."
  },
  {
    "id": "arrheniusPrefactorSCm",
    "label": "Arrhenius prefactor (S/cm)",
    "unit": "S/cm",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "Pre-exponential term from the Arrhenius fit — the conductivity the fit extrapolates to at infinitely high temperature."
  },
  {
    "id": "vftPrefactorSCmT12",
    "label": "VFT prefactor (S/cm*T^(1/2))",
    "unit": "S/cm*T^(1/2)",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "Pre-exponential term from the VFT fit, scaled by the square root of temperature."
  },
  {
    "id": "vftPrefactorWithSetT0",
    "label": "VFT prefactor with set T0",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "VFT pre-exponential term from the fit where T0 was held fixed."
  },
  {
    "id": "transferenceNumber",
    "label": "Transference number",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "Fraction of the total ionic current carried by the lithium ion rather than its counter-ion — higher generally means better battery performance."
  },
  {
    "id": "dryingTemp",
    "label": "drying temp",
    "unit": "°C",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "Temperature the sample was dried at during preparation, to drive off residual casting solvent."
  },
  {
    "id": "dryingTimeH",
    "label": "drying time (h)",
    "unit": "h",
    "kind": "continuous",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [],
    "description": "drying time for solvent removal"
  },
  {
    "id": "polymerFamily",
    "label": "Polymer family",
    "kind": "categorical",
    "plottableOn": [
      "explore",
      "temperature"
    ],
    "filterableOn": [
      "explore",
      "temperature"
    ],
    "description": "Chemical family of the polymer's backbone (e.g. ether, ester, carbonate)."
  },
  {
    "id": "polymer",
    "label": "Polymer",
    "kind": "categorical",
    "plottableOn": [
      "explore"
    ],
    "filterableOn": [
      "explore"
    ],
    "description": "Name of the specific polymer used as the electrolyte host."
  },
  {
    "id": "anion",
    "label": "Anion",
    "kind": "categorical",
    "plottableOn": [
      "explore",
      "temperature"
    ],
    "filterableOn": [
      "explore",
      "temperature"
    ],
    "description": "The lithium salt's counter-ion (e.g. TFSI, ClO4), paired with the Li+ cation that actually carries charge."
  },
  {
    "id": "crystalline",
    "label": "crystalline?",
    "kind": "categorical",
    "plottableOn": [
      "explore",
      "temperature"
    ],
    "filterableOn": [
      "explore",
      "temperature"
    ],
    "description": "is the electrolyte crystalline?: 'yes', 'no', 'n/a'"
  },
  {
    "id": "solventUsed",
    "label": "Solvent used",
    "kind": "categorical",
    "plottableOn": [
      "explore",
      "temperature"
    ],
    "filterableOn": [
      "explore",
      "temperature"
    ],
    "description": "Solvent the polymer was dissolved/cast in during sample preparation."
  },
  {
    "id": "conductivityAt0C",
    "label": "Conductivity at 0C",
    "unit": "S/cm",
    "kind": "continuous",
    "plottableOn": [],
    "filterableOn": [],
    "description": "Ionic conductivity of the electrolyte measured at 0°C."
  },
  {
    "id": "conductivityAt15C",
    "label": "Conductivity at 15C",
    "unit": "S/cm",
    "kind": "continuous",
    "plottableOn": [],
    "filterableOn": [],
    "description": "Ionic conductivity of the electrolyte measured at 15°C."
  },
  {
    "id": "conductivityAt20C",
    "label": "Conductivity at 20C",
    "unit": "S/cm",
    "kind": "continuous",
    "plottableOn": [],
    "filterableOn": [],
    "description": "Ionic conductivity of the electrolyte measured at 20°C."
  },
  {
    "id": "conductivityAt21C",
    "label": "Conductivity at 21C",
    "unit": "S/cm",
    "kind": "continuous",
    "plottableOn": [],
    "filterableOn": [],
    "description": "Ionic conductivity of the electrolyte measured at 21°C."
  },
  {
    "id": "conductivityAt25C",
    "label": "Conductivity at 25C",
    "unit": "S/cm",
    "kind": "continuous",
    "plottableOn": [],
    "filterableOn": [],
    "description": "Ionic conductivity of the electrolyte measured at 25°C (approximately room temperature)."
  },
  {
    "id": "conductivityAt27C",
    "label": "Conductivity at 27C",
    "unit": "S/cm",
    "kind": "continuous",
    "plottableOn": [],
    "filterableOn": [],
    "description": "Ionic conductivity of the electrolyte measured at 27°C."
  },
  {
    "id": "conductivityAt35C",
    "label": "Conductivity at 35C",
    "unit": "S/cm",
    "kind": "continuous",
    "plottableOn": [],
    "filterableOn": [],
    "description": "Ionic conductivity of the electrolyte measured at 35°C."
  },
  {
    "id": "conductivityAt40C",
    "label": "Conductivity at 40C",
    "unit": "S/cm",
    "kind": "continuous",
    "plottableOn": [],
    "filterableOn": [],
    "description": "Ionic conductivity of the electrolyte measured at 40°C."
  },
  {
    "id": "conductivityAt45C",
    "label": "Conductivity at 45C",
    "unit": "S/cm",
    "kind": "continuous",
    "plottableOn": [],
    "filterableOn": [],
    "description": "Ionic conductivity of the electrolyte measured at 45°C."
  },
  {
    "id": "conductivityAt50C",
    "label": "Conductivity at 50C",
    "unit": "S/cm",
    "kind": "continuous",
    "plottableOn": [],
    "filterableOn": [],
    "description": "Ionic conductivity of the electrolyte measured at 50°C."
  },
  {
    "id": "conductivityAt55C",
    "label": "Conductivity at 55C",
    "unit": "S/cm",
    "kind": "continuous",
    "plottableOn": [],
    "filterableOn": [],
    "description": "Ionic conductivity of the electrolyte measured at 55°C."
  },
  {
    "id": "conductivityAt65C",
    "label": "Conductivity at 65C",
    "unit": "S/cm",
    "kind": "continuous",
    "plottableOn": [],
    "filterableOn": [],
    "description": "Ionic conductivity of the electrolyte measured at 65°C."
  },
  {
    "id": "conductivityAt70C",
    "label": "Conductivity at 70C",
    "unit": "S/cm",
    "kind": "continuous",
    "plottableOn": [],
    "filterableOn": [],
    "description": "Ionic conductivity of the electrolyte measured at 70°C."
  },
  {
    "id": "conductivityAt75C",
    "label": "Conductivity at 75C",
    "unit": "S/cm",
    "kind": "continuous",
    "plottableOn": [],
    "filterableOn": [],
    "description": "Ionic conductivity of the electrolyte measured at 75°C."
  },
  {
    "id": "conductivityAt80C",
    "label": "Conductivity at 80C",
    "unit": "S/cm",
    "kind": "continuous",
    "plottableOn": [],
    "filterableOn": [],
    "description": "Ionic conductivity of the electrolyte measured at 80°C."
  },
  {
    "id": "conductivityAt85C",
    "label": "Conductivity at 85C",
    "unit": "S/cm",
    "kind": "continuous",
    "plottableOn": [],
    "filterableOn": [],
    "description": "Ionic conductivity of the electrolyte measured at 85°C."
  },
  {
    "id": "conductivityAt100C",
    "label": "Conductivity at 100C",
    "unit": "S/cm",
    "kind": "continuous",
    "plottableOn": [],
    "filterableOn": [],
    "description": "Ionic conductivity of the electrolyte measured at 100°C."
  },
  {
    "id": "conductivityAt110C",
    "label": "Conductivity at 110C",
    "unit": "S/cm",
    "kind": "continuous",
    "plottableOn": [],
    "filterableOn": [],
    "description": "Ionic conductivity of the electrolyte measured at 110°C."
  },
  {
    "id": "conductivityAt125C",
    "label": "Conductivity at 125C",
    "unit": "S/cm",
    "kind": "continuous",
    "plottableOn": [],
    "filterableOn": [],
    "description": "Ionic conductivity of the electrolyte measured at 125°C."
  },
  {
    "id": "tgPolymerWithoutSalt",
    "label": "Tg polymer without salt",
    "unit": "°C",
    "kind": "continuous",
    "plottableOn": [],
    "filterableOn": [],
    "description": "Glass transition temperature of the bare polymer, measured before any lithium salt is added."
  },
  {
    "id": "polymerMnKDa",
    "label": "Polymer Mn (kDa)",
    "unit": "kDa",
    "kind": "continuous",
    "plottableOn": [],
    "filterableOn": [],
    "description": "Number-average molecular weight of the polymer (kDa) — reflects the typical chain length."
  },
  {
    "id": "polymerMwKDa",
    "label": "Polymer Mw (kDa)",
    "unit": "kDa",
    "kind": "continuous",
    "plottableOn": [],
    "filterableOn": [],
    "description": "Weight-average molecular weight of the polymer (kDa) — weighted toward longer chains than Mn, so it's more sensitive to a few very long chains."
  },
  {
    "id": "comonomerPercentage",
    "label": "Comonomer percentage",
    "unit": "%",
    "kind": "continuous",
    "plottableOn": [],
    "filterableOn": [],
    "description": "Percentage of the minority comonomer making up the copolymer."
  },
  {
    "id": "doi",
    "label": "DOI",
    "kind": "categorical",
    "plottableOn": [],
    "filterableOn": [
      "explore",
      "temperature"
    ],
    "description": "Digital Object Identifier — a permanent link to the published paper this sample's data came from."
  },
  {
    "id": "reference",
    "label": "Reference",
    "kind": "categorical",
    "plottableOn": [],
    "filterableOn": [],
    "description": "Full citation for the paper this sample was reported in."
  },
  {
    "id": "notes",
    "label": "Notes",
    "kind": "categorical",
    "plottableOn": [],
    "filterableOn": [],
    "description": "Free-text notes recorded by the original curators about this sample."
  },
  {
    "id": "smilesDescriptor1",
    "label": "SMILES descriptor 1",
    "kind": "categorical",
    "plottableOn": [],
    "filterableOn": [],
    "description": "SMILES string — a compact text notation encoding comonomer 1's molecular structure."
  },
  {
    "id": "smilesDescriptor2",
    "label": "SMILES descriptor 2",
    "kind": "categorical",
    "plottableOn": [],
    "filterableOn": [],
    "description": "SMILES string — a compact text notation encoding comonomer 2's molecular structure."
  }
];

export const COLUMN_BY_ID: Readonly<Record<string, ColumnMeta>> = Object.fromEntries(
  COLUMNS.map((column) => [column.id, column] as const),
);

export const NUMERIC_COLUMN_IDS = ["approxTg","tg","approxMWKDa","liFunctionalGroup","conductivityAt30C","conductivityAt60C","conductivityAt90C","comonomer1Apol","comonomer1Vabc","comonomer1MW","comonomer1ETA_eta_F","comonomer1AETA_eta_FL","comonomer1AETA_eta_RL","comonomer2Apol","comonomer2Vabc","comonomer2MW","comonomer2AETA_eta_F","comonomer2AETA_dBeta","comonomer2ETA_epsilon_1","comonomer2ETA_dBeta","comonomer2ETA_dAlpha_B","anionApol","anionVabc","anionNHBAcc","anionNO","anionAETA_alpha","anionETA_shape_x","arrheniusEaEV","vftActivationEnergyK","vftActivationEnergyWithFixedT0K","arrheniusPrefactorSCm","vftPrefactorSCmT12","vftPrefactorWithSetT0","transferenceNumber","dryingTemp","dryingTimeH","conductivityAt0C","conductivityAt15C","conductivityAt20C","conductivityAt21C","conductivityAt25C","conductivityAt27C","conductivityAt35C","conductivityAt40C","conductivityAt45C","conductivityAt50C","conductivityAt55C","conductivityAt65C","conductivityAt70C","conductivityAt75C","conductivityAt80C","conductivityAt85C","conductivityAt100C","conductivityAt110C","conductivityAt125C","tgPolymerWithoutSalt","polymerMnKDa","polymerMwKDa","comonomerPercentage"] as const;
export type NumericColumnId = (typeof NUMERIC_COLUMN_IDS)[number];

export const CATEGORICAL_COLUMN_IDS = ["polymerFamily","polymer","anion","crystalline","solventUsed","doi","reference","notes","smilesDescriptor1","smilesDescriptor2"] as const;
export type CategoricalColumnId = (typeof CATEGORICAL_COLUMN_IDS)[number];

export type ColumnId = NumericColumnId | CategoricalColumnId;

/** The subset of categorical columns with a frozen order in categories.json (DATA-SPEC.md §7). */
export const FROZEN_CATEGORY_COLUMN_IDS = ["polymerFamily","polymer","anion","crystalline","solventUsed","doi"] as const;
export type FrozenCategoryColumnId = (typeof FROZEN_CATEGORY_COLUMN_IDS)[number];
