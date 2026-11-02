"""تحليل قرآني استكشافي قابل لإعادة الإنتاج.

لا يقدّم هذا الملف استنتاجات دينية أو سببية؛ يصف اختبارات إحصائية على
تصنيفات محددة مسبقًا، مع حفظ البذرة وإصدارات البيئة وخوارزمية RNG.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd
import scipy
from scipy.stats import chi2_contingency, kruskal, random_table

CIVIL_SURAHS = {2, 3, 4, 5, 8, 9, 13, 22, 24, 33, 47, 48, 49, 55, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 76, 98, 99, 110}
DEFAULT_SEED = 12345
DEFAULT_B = 200_000
KRUSKAL_COLUMNS = ("surah_number", "ayahs_count", "combined_value", "abjad_value")

ABJAD_MAP = {
    "أ": 1, "إ": 1, "آ": 1, "ا": 1, "ب": 2, "ج": 3, "د": 4, "ه": 5,
    "ة": 5, "و": 6, "ؤ": 6, "ز": 7, "ح": 8, "ط": 9, "ي": 10,
    "ئ": 10, "ى": 10, "ك": 20, "ل": 30, "م": 40, "ن": 50, "س": 60,
    "ع": 70, "ف": 80, "ص": 90, "ق": 100, "ر": 200, "ش": 300,
    "ت": 400, "ث": 500, "خ": 600, "ذ": 700, "ض": 800, "ظ": 900, "غ": 1000,
}

NORMALIZATION_RULES = {
    "hamza": "أ، إ، آ، ا تُحسب بقيمة الألف 1",
    "ta_marbuta": "ة تُحسب هاء بقيمة 5",
    "waw_hamza": "ؤ تُحسب واو بقيمة 6",
    "alif_maqsura": "ى تُحسب ياء بقيمة 10",
    "unknown_characters": "المسافات وعلامات الترقيم والأحرف خارج الخريطة تُهمل، ولا تُمنح قيمة صفرية كحرف دال",
}


def digital_root(value: int) -> int:
    value = abs(int(value))
    if value == 0:
        return 0
    return 1 + (value - 1) % 9


def normalized_abjad_value(text: str) -> int:
    return sum(ABJAD_MAP.get(char, 0) for char in text if not char.isspace())


class ScientificQuranAnalyzer:
    def __init__(self, surahs_dataset: list[tuple[int, str, int]]):
        self.raw_data = surahs_dataset
        self.df = self._build_dataframe()

    def _build_dataframe(self) -> pd.DataFrame:
        rows: list[dict[str, Any]] = []
        for number, name, ayahs in self.raw_data:
            abjad_value = normalized_abjad_value(name)
            rows.append({
                "surah_number": number,
                "surah_name": name,
                "ayahs_count": ayahs,
                "type": "مدنية" if number in CIVIL_SURAHS else "مكية",
                "surah_number_root": digital_root(number),
                "ayahs_count_root": digital_root(ayahs),
                "combined_value": number + ayahs,
                "combined_root": digital_root(number + ayahs),
                "abjad_value": abjad_value,
                "abjad_root": digital_root(abjad_value),
            })
        return pd.DataFrame(rows)

    def run_monte_carlo_test(self, column: str, B: int = DEFAULT_B, seed: int = DEFAULT_SEED) -> dict[str, Any]:
        if column not in {"surah_number_root", "ayahs_count_root", "combined_root", "abjad_root"}:
            raise ValueError(f"Unsupported analysis column: {column}")
        if B < 1:
            raise ValueError("B must be positive")
        table = pd.crosstab(self.df[column], self.df["type"]).reindex(columns=["مكية", "مدنية"], fill_value=0)
        observed = table.to_numpy(dtype=float)
        chi2_observed = float(chi2_contingency(observed, correction=False).statistic)
        row_totals = observed.sum(axis=1).astype(int)
        col_totals = observed.sum(axis=0).astype(int)
        expected = np.outer(row_totals, col_totals) / observed.sum()
        rng = np.random.Generator(np.random.PCG64(seed))
        exceedances = 0
        batch_size = min(10_000, B)
        remaining = B
        while remaining:
            size = min(batch_size, remaining)
            simulated = random_table.rvs(row_totals, col_totals, size=size, random_state=rng)
            chi2_sim = ((simulated - expected) ** 2 / np.where(expected == 0, 1, expected)).sum(axis=(1, 2))
            exceedances += int(np.count_nonzero(chi2_sim >= chi2_observed))
            remaining -= size
        p_value = (exceedances + 1) / (B + 1)
        se = float(np.sqrt(p_value * (1 - p_value) / (B + 1)))
        cramers_v = float(np.sqrt(chi2_observed / (observed.sum() * (min(table.shape) - 1))))
        return {
            "column": column,
            "chi2_observed": chi2_observed,
            "degrees_of_freedom": int((table.shape[0] - 1) * (table.shape[1] - 1)),
            "exceedances": exceedances,
            "p_value_monte_carlo": float(p_value),
            "standard_error_se": se,
            "cramers_v": cramers_v,
            "contingency_table": table.to_dict(),
            "B": B,
            "seed": seed,
            "rng_algorithm": "PCG64",
        }

    def run_kruskal_wallis_test(self, column: str) -> dict[str, Any]:
        """Compare a numeric feature across the predefined Makki/Madani groups."""
        if column not in KRUSKAL_COLUMNS:
            raise ValueError(f"Unsupported Kruskal-Wallis column: {column}")
        groups = [self.df.loc[self.df["type"] == label, column].to_numpy(dtype=float)
                  for label in ("مكية", "مدنية")]
        statistic, p_value = kruskal(*groups)
        degrees_of_freedom = len(groups) - 1
        epsilon_squared = max(0.0, float((statistic - degrees_of_freedom) / (len(self.df) - degrees_of_freedom)))
        return {
            "column": column,
            "test": "Kruskal-Wallis H",
            "groups": {"مكية": int(len(groups[0])), "مدنية": int(len(groups[1]))},
            "H_statistic": float(statistic),
            "degrees_of_freedom": int(degrees_of_freedom),
            "p_value": float(p_value),
            "epsilon_squared": epsilon_squared,
        }

    def build_report(self, B: int = DEFAULT_B, seed: int = DEFAULT_SEED) -> dict[str, Any]:
        columns = ["surah_number_root", "ayahs_count_root", "combined_root", "abjad_root"]
        return {
            "metadata": {
                "timestamp_utc": datetime.now(timezone.utc).isoformat(),
                "total_surahs": int(len(self.df)),
                "civil_surahs": int((self.df["type"] == "مدنية").sum()),
                "simulations_B": B,
                "random_seed": seed,
                "rng_algorithm": "PCG64",
                "numpy_version": np.__version__,
                "scipy_version": scipy.__version__,
                "pandas_version": pd.__version__,
                "normalization_rules": NORMALIZATION_RULES,
            },
            "tests": {column: self.run_monte_carlo_test(column, B=B, seed=seed) for column in columns},
            "kruskal_wallis": {column: self.run_kruskal_wallis_test(column) for column in KRUSKAL_COLUMNS},
            "rows": self.df.to_dict(orient="records"),
        }
