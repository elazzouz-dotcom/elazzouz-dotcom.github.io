#!/usr/bin/env python3
"""Create a reproducible chi-square Monte Carlo distribution plot."""
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
from scipy.stats import random_table

SEED = 12345
B = 200_000
OUTPUT = Path(__file__).with_name("chi2_simulation_distribution_seed12345.png")

observed = np.array([
    [8, 4], [15, 4], [12, 2], [6, 2], [7, 5],
    [9, 1], [10, 4], [12, 4], [7, 2],
], dtype=int)
row_totals = observed.sum(axis=1)
col_totals = observed.sum(axis=0)
n_total = int(observed.sum())
expected = np.outer(row_totals, col_totals) / n_total
chi2_observed = float(np.sum((observed - expected) ** 2 / expected))

rng = np.random.Generator(np.random.PCG64(SEED))
# Draw tables with exactly the observed row and column margins.
simulated = random_table.rvs(row_totals, col_totals, size=B, random_state=rng)
chi2_simulated = ((simulated - expected) ** 2 / expected).sum(axis=(1, 2))

exceedances = int(np.count_nonzero(chi2_simulated >= chi2_observed))
p_mc = (exceedances + 1) / (B + 1)
se_mc = np.sqrt(p_mc * (1 - p_mc) / (B + 1))

plt.style.use("seaborn-v0_8-whitegrid")
fig, ax = plt.subplots(figsize=(11, 6.5), dpi=180)
ax.hist(
    chi2_simulated,
    bins=90,
    density=True,
    color="#59b894",
    alpha=0.78,
    edgecolor="#17352c",
    linewidth=0.25,
    label=f"Monte Carlo distribution (B={B:,}, seed={SEED})",
)
ax.axvline(
    chi2_observed,
    color="#d64045",
    linewidth=2.5,
    linestyle="--",
    label=rf"Observed $\chi^2$ = {chi2_observed:.4f}",
)
ax.axvspan(chi2_observed, ax.get_xlim()[1], color="#d64045", alpha=0.08)
ax.text(
    chi2_observed + 0.04,
    ax.get_ylim()[1] * 0.92,
    f"Exceedances: {exceedances:,}\np_MC = {p_mc:.5f}\nSE = {se_mc:.5f}",
    color="#9d2529",
    fontsize=10,
    va="top",
    bbox={"boxstyle": "round,pad=0.4", "facecolor": "white", "edgecolor": "#d64045", "alpha": 0.9},
)
ax.set_title("Distribution of Simulated Pearson χ² Statistics", fontsize=15, weight="bold")
ax.set_xlabel("Simulated Pearson χ² statistic")
ax.set_ylabel("Density")
ax.legend(frameon=True, loc="upper right")
ax.text(
    0.01,
    -0.18,
    "Fixed margins: 9×2 table · source table n=114 · seed=12345 · scipy.stats.random_table",
    transform=ax.transAxes,
    fontsize=9,
    color="#4c5b57",
)
fig.tight_layout()
fig.savefig(OUTPUT, bbox_inches="tight")
print(f"Saved: {OUTPUT}")
print(f"Observed chi2: {chi2_observed:.10f}")
print(f"Exceedances: {exceedances}")
print(f"p_MC: {p_mc:.10f}")
print(f"SE_MC: {se_mc:.10f}")
