#!/usr/bin/env python3
"""Corrected reproducible Quran root/type analyzer for offline report generation."""
from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import scipy
from scipy.stats import chi2_contingency, random_table


REQUIRED_COLUMNS = ("combined_root", "type")


@dataclass(frozen=True)
class SimulationConfig:
    samples: int = 200_000
    seed: int = 42
    continuity_correction: bool = False


def digital_root(value: int) -> int:
    value = abs(int(value))
    while value >= 10:
        value = sum(int(digit) for digit in str(value))
    return value


class ScientificQuranAnalyzer:
    """Build validated source data and run a fixed-margin Monte Carlo test."""

    CIVIL_SURAHS = frozenset({2, 3, 4, 5, 8, 9, 13, 22, 24, 33, 47, 48, 49, 55, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 76, 98, 99, 110})

    def __init__(self, surahs_dataset: list[tuple[int, str, int]]):
        self.raw_data = surahs_dataset
        self.df = self._build_dataframe()

    def _build_dataframe(self) -> pd.DataFrame:
        rows = []
        for number, name, ayahs in self.raw_data:
            rows.append({
                "surah_number": number,
                "surah_name": name,
                "ayahs_count": ayahs,
                "type": "مدنية" if number in self.CIVIL_SURAHS else "مكية",
                "combined_root": digital_root(number + ayahs),
                "ayahs_count_root": digital_root(ayahs),
            })
        return pd.DataFrame(rows)

    def run_monte_carlo_independence_test(self, config: SimulationConfig = SimulationConfig()) -> dict:
        if config.samples <= 0:
            raise ValueError("samples must be positive")

        # Corrected reference: self.df["type"], not self["type"].
        # Keep pandas' deterministic sorted column order (مدنية, مكية).
        # The order is part of the seeded random_table execution path.
        table = pd.crosstab(self.df["combined_root"], self.df["type"])
        table = table.sort_index(axis=0).sort_index(axis=1)
        observed = table.to_numpy(dtype=np.int64)
        expected = np.outer(observed.sum(axis=1), observed.sum(axis=0)) / observed.sum()
        chi2_observed = float(chi2_contingency(observed, correction=config.continuity_correction).statistic)

        rng = np.random.default_rng(config.seed)
        simulated = random_table.rvs(observed.sum(axis=1), observed.sum(axis=0), size=config.samples, random_state=rng)
        chi2_simulated = ((simulated - expected) ** 2 / expected).sum(axis=(1, 2))
        exceedances = int(np.count_nonzero(chi2_simulated >= chi2_observed))
        p_mc = (exceedances + 1) / (config.samples + 1)
        se_mc = float(np.sqrt(p_mc * (1 - p_mc) / (config.samples + 1)))
        n_total = int(observed.sum())
        cramers_v = float(np.sqrt(chi2_observed / (n_total * (min(table.shape) - 1))))

        return {
            "metadata": {
                "timestamp_utc": datetime.now(timezone.utc).isoformat(),
                "total_surahs": n_total,
                "simulations_B": config.samples,
                "random_seed": config.seed,
                "numpy_version": np.__version__,
                "pandas_version": pd.__version__,
                "scipy_version": scipy.__version__,
            },
            "statistical_metrics": {
                "chi2_observed": chi2_observed,
                "degrees_of_freedom": int((table.shape[0] - 1) * (table.shape[1] - 1)),
                "exceedances": exceedances,
                "p_value_monte_carlo": float(p_mc),
                "standard_error_se": se_mc,
                "cramers_v": cramers_v,
            },
            "contingency_table": {str(index): {str(column): int(table.loc[index, column]) for column in table.columns} for index in table.index},
        }

    @staticmethod
    def export_report(report: dict, output: Path) -> None:
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_csv(path: Path) -> list[tuple[int, str, int]]:
    frame = pd.read_csv(path)
    missing = [column for column in ("surah_number", "surah_name", "ayahs_count") if column not in frame.columns]
    if missing:
        raise ValueError(f"CSV missing required column(s): {', '.join(missing)}")
    return [(int(row.surah_number), str(row.surah_name), int(row.ayahs_count)) for row in frame.itertuples(index=False)]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("--output-json", type=Path, required=True)
    parser.add_argument("--samples", type=int, default=200_000)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    analyzer = ScientificQuranAnalyzer(load_csv(args.input_csv))
    report = analyzer.run_monte_carlo_independence_test(SimulationConfig(args.samples, args.seed))
    analyzer.export_report(report, args.output_json)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
