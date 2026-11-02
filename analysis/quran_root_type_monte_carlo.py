#!/usr/bin/env python3
"""Reproducible fixed-margin Monte Carlo chi-square simulation.

Input CSV requirements:
  - combined_root: categorical root/group label
  - type: categorical type label

The script uses scipy.stats.random_table to sample contingency tables with the
same row and column margins as the observed table. Exact bit-for-bit results
require the same Python, NumPy, SciPy versions, platform, and code path.
"""

from __future__ import annotations

import argparse
import json
import platform
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import pandas as pd
import scipy
from scipy.stats import chi2_contingency, random_table


DEFAULT_SEED = 12345
DEFAULT_SAMPLES = 200_000
REQUIRED_COLUMNS = ("combined_root", "type")


@dataclass(frozen=True)
class SimulationConfig:
    samples: int = DEFAULT_SAMPLES
    seed: int = DEFAULT_SEED
    correction: bool = False


def chi_square_statistic(tables: np.ndarray, expected: np.ndarray) -> np.ndarray:
    """Return Pearson chi-square statistics for one or many tables."""
    with np.errstate(divide="raise", invalid="raise"):
        return ((tables - expected) ** 2 / expected).sum(axis=(-2, -1))


def load_table(csv_path: Path) -> tuple[pd.DataFrame, np.ndarray]:
    """Load the source CSV and build the observed contingency table."""
    frame = pd.read_csv(csv_path)
    missing = [column for column in REQUIRED_COLUMNS if column not in frame.columns]
    if missing:
        raise ValueError(
            f"CSV is missing required column(s): {', '.join(missing)}. "
            f"Expected: {', '.join(REQUIRED_COLUMNS)}"
        )

    frame = frame.loc[:, list(REQUIRED_COLUMNS)].dropna()
    if frame.empty:
        raise ValueError("After removing missing values, the input CSV is empty.")

    table = pd.crosstab(frame["combined_root"], frame["type"])
    observed = table.to_numpy(dtype=np.int64)
    if observed.ndim != 2 or min(observed.shape) < 2:
        raise ValueError("The contingency table must have at least 2 rows and 2 columns.")
    if (observed.sum(axis=0) == 0).any() or (observed.sum(axis=1) == 0).any():
        raise ValueError("Every row and column must contain at least one observation.")
    return table, observed


def run_simulation(observed: np.ndarray, config: SimulationConfig) -> dict:
    """Run the fixed-margin Monte Carlo simulation with a local seeded RNG."""
    if config.samples <= 0:
        raise ValueError("samples must be a positive integer")

    expected = np.outer(observed.sum(axis=1), observed.sum(axis=0)) / observed.sum()
    chi2_observed = float(
        chi2_contingency(observed, correction=config.correction).statistic
    )

    # Use one local Generator and one deterministic random_table.rvs call.
    # Do not add random calls before this line if exact reproducibility matters.
    rng = np.random.Generator(np.random.PCG64(config.seed))
    simulated = random_table.rvs(
        observed.sum(axis=1),
        observed.sum(axis=0),
        size=config.samples,
        random_state=rng,
    )
    chi2_simulated = chi_square_statistic(simulated, expected)

    exceedances = int(np.count_nonzero(chi2_simulated >= chi2_observed))
    p_mc = (exceedances + 1) / (config.samples + 1)
    # Keep the uncertainty estimate consistent with the +1 corrected
    # Monte Carlo proportion used above.
    se_mc = float(np.sqrt(p_mc * (1.0 - p_mc) / (config.samples + 1)))

    return {
        "config": asdict(config),
        "observed_shape": list(observed.shape),
        "observed_total": int(observed.sum()),
        "chi2_observed": chi2_observed,
        "exceedances": exceedances,
        "p_mc": float(p_mc),
        "se_mc": se_mc,
        "formula": "(exceedances + 1) / (samples + 1)",
        "environment": {
            "python": sys.version,
            "platform": platform.platform(),
            "numpy": np.__version__,
            "pandas": pd.__version__,
            "scipy": scipy.__version__,
            "rng_algorithm": "PCG64",
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input_csv", type=Path, help="CSV with combined_root and type columns")
    parser.add_argument("--output-json", type=Path, default=None, help="Optional result JSON path")
    parser.add_argument("--samples", type=int, default=DEFAULT_SAMPLES)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument(
        "--continuity-correction",
        action="store_true",
        help="Use Yates correction for the observed chi-square statistic",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    table, observed = load_table(args.input_csv)
    config = SimulationConfig(
        samples=args.samples,
        seed=args.seed,
        correction=args.continuity_correction,
    )
    result = run_simulation(observed, config)
    result["categories"] = {
        "combined_root": [str(value) for value in table.index],
        "type": [str(value) for value in table.columns],
    }
    result["observed_table"] = observed.tolist()

    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output_json:
        args.output_json.parent.mkdir(parents=True, exist_ok=True)
        args.output_json.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
