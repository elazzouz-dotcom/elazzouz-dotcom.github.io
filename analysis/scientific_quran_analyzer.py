#!/usr/bin/env python3
"""Reproducible exploratory analyzer for Quran surah roots and abjad values."""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import scipy
from scipy.stats import chi2_contingency, kruskal, random_table

DEFAULT_SAMPLES = 200_000
DEFAULT_SEED = 12345
CIVIL_SURAHS = frozenset({2, 3, 4, 5, 8, 9, 13, 22, 24, 33, 47, 48, 49, 55, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 76, 98, 99, 110})
ABJAD_MAP = {"أ": 1, "إ": 1, "آ": 1, "ا": 1, "ب": 2, "ج": 3, "د": 4, "ه": 5, "ة": 5, "و": 6, "ؤ": 6, "ز": 7, "ح": 8, "ط": 9, "ي": 10, "ئ": 10, "ى": 10, "ك": 20, "ل": 30, "م": 40, "ن": 50, "س": 60, "ع": 70, "ف": 80, "ص": 90, "ق": 100, "ر": 200, "ش": 300, "ت": 400, "ث": 500, "خ": 600, "ذ": 700, "ض": 800, "ظ": 900, "غ": 1000}
ANALYSIS_COLUMNS = ("surah_number_root", "ayahs_count_root", "combined_root", "abjad_root")
KRUSKAL_COLUMNS = ("surah_number", "ayahs_count", "combined_value", "abjad_value")
NORMALIZATION_RULES = {"hamza": "أ، إ، آ، ا → ا/1", "ta_marbuta": "ة → ه/5", "waw_hamza": "ؤ → و/6", "alif_maqsura": "ى → ي/10", "unknown": "المسافات وعلامات الترقيم والأحرف خارج الخريطة لا تضيف قيمة"}


@dataclass(frozen=True)
class SimulationConfig:
    samples: int = DEFAULT_SAMPLES
    seed: int = DEFAULT_SEED
    continuity_correction: bool = False


def digital_root(value: int) -> int:
    value = abs(int(value))
    return 0 if value == 0 else 1 + (value - 1) % 9


def abjad_value(text: str) -> int:
    return sum(ABJAD_MAP.get(char, 0) for char in text if not char.isspace())


class ScientificQuranAnalyzer:
    CIVIL_SURAHS = CIVIL_SURAHS

    def __init__(self, surahs_dataset: list[tuple[int, str, int]]):
        self.raw_data = surahs_dataset
        self.df = self._build_dataframe()

    def _build_dataframe(self) -> pd.DataFrame:
        rows = []
        for number, name, ayahs in self.raw_data:
            value = abjad_value(name)
            rows.append({
                "surah_number": number, "surah_name": name, "ayahs_count": ayahs,
                "type": "مدنية" if number in self.CIVIL_SURAHS else "مكية",
                "surah_number_root": digital_root(number), "ayahs_count_root": digital_root(ayahs),
                "combined_value": number + ayahs, "combined_root": digital_root(number + ayahs),
                "abjad_value": value, "abjad_root": digital_root(value),
            })
        return pd.DataFrame(rows)

    def run_monte_carlo_independence_test(self, column: str, config: SimulationConfig = SimulationConfig()) -> dict:
        if column not in ANALYSIS_COLUMNS:
            raise ValueError(f"unsupported analysis column: {column}")
        if config.samples <= 0:
            raise ValueError("samples must be positive")
        # The important correction is self.df["type"], never self["type"].
        table = pd.crosstab(self.df[column], self.df["type"]).reindex(columns=["مكية", "مدنية"], fill_value=0)
        table = table.sort_index(axis=0)
        observed = table.to_numpy(dtype=np.int64)
        row_totals = observed.sum(axis=1)
        col_totals = observed.sum(axis=0)
        expected = np.outer(row_totals, col_totals) / observed.sum()
        chi2_observed = float(chi2_contingency(observed, correction=config.continuity_correction).statistic)
        rng = np.random.Generator(np.random.PCG64(config.seed))
        exceedances = 0
        remaining = config.samples
        batch_size = min(10_000, config.samples)
        while remaining:
            size = min(batch_size, remaining)
            simulated = random_table.rvs(row_totals, col_totals, size=size, random_state=rng)
            chi2_sim = ((simulated - expected) ** 2 / np.where(expected == 0, 1, expected)).sum(axis=(1, 2))
            exceedances += int(np.count_nonzero(chi2_sim >= chi2_observed))
            remaining -= size
        p_mc = (exceedances + 1) / (config.samples + 1)
        se_mc = float(np.sqrt(p_mc * (1 - p_mc) / (config.samples + 1)))
        cramers_v = float(np.sqrt(chi2_observed / (observed.sum() * (min(table.shape) - 1))))
        return {"column": column, "metadata": {"simulations_B": config.samples, "random_seed": config.seed, "rng_algorithm": "PCG64"}, "statistical_metrics": {"chi2_observed": chi2_observed, "degrees_of_freedom": int((table.shape[0] - 1) * (table.shape[1] - 1)), "exceedances": exceedances, "p_value_monte_carlo": float(p_mc), "standard_error_se": se_mc, "cramers_v": cramers_v}, "contingency_table": {str(index): {str(column_name): int(table.loc[index, column_name]) for column_name in table.columns} for index in table.index}}

    def run_kruskal_wallis_test(self, column: str) -> dict:
        """Compare a numeric feature across the predefined Makki/Madani groups."""
        if column not in KRUSKAL_COLUMNS:
            raise ValueError(f"unsupported Kruskal-Wallis column: {column}")
        groups = [self.df.loc[self.df["type"] == label, column].to_numpy(dtype=float)
                  for label in ("مكية", "مدنية")]
        statistic, p_value = kruskal(*groups)
        degrees_of_freedom = len(groups) - 1
        epsilon_squared = max(0.0, float((statistic - degrees_of_freedom) / (len(self.df) - degrees_of_freedom)))
        return {
            "column": column,
            "test": "Kruskal-Wallis H",
            "groups": {"مكية": int(len(groups[0])), "مدنية": int(len(groups[1]))},
            "statistical_metrics": {
                "H_statistic": float(statistic),
                "degrees_of_freedom": int(degrees_of_freedom),
                "p_value": float(p_value),
                "epsilon_squared": epsilon_squared,
            },
        }

    def build_report(self, config: SimulationConfig = SimulationConfig()) -> dict:
        return {"metadata": {"timestamp_utc": datetime.now(timezone.utc).isoformat(), "total_surahs": int(len(self.df)), "civil_surahs": int((self.df["type"] == "مدنية").sum()), "simulations_B": config.samples, "random_seed": config.seed, "rng_algorithm": "PCG64", "numpy_version": np.__version__, "scipy_version": scipy.__version__, "pandas_version": pd.__version__, "normalization_rules": NORMALIZATION_RULES}, "tests": {column: self.run_monte_carlo_independence_test(column, config) for column in ANALYSIS_COLUMNS}, "kruskal_wallis": {column: self.run_kruskal_wallis_test(column) for column in KRUSKAL_COLUMNS}, "rows": self.df.to_dict(orient="records")}

    @staticmethod
    def export_report(report: dict, output: Path) -> None:
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_csv(path: Path) -> list[tuple[int, str, int]]:
    frame = pd.read_csv(path)
    required = ("surah_number", "surah_name", "ayahs_count")
    missing = [column for column in required if column not in frame.columns]
    if missing:
        raise ValueError(f"CSV missing required column(s): {', '.join(missing)}")
    return [(int(row.surah_number), str(row.surah_name), int(row.ayahs_count)) for row in frame.itertuples(index=False)]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("--output-json", type=Path, required=True)
    parser.add_argument("--samples", type=int, default=DEFAULT_SAMPLES)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    args = parser.parse_args()
    report = ScientificQuranAnalyzer(load_csv(args.input_csv)).build_report(SimulationConfig(args.samples, args.seed))
    ScientificQuranAnalyzer.export_report(report, args.output_json)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
