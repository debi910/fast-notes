"""Single-note refit and rating-order replay.

Model (simplified bridging MF, after github.com/twitter/communitynotes):
    rating ~ mu + i_u + i_n + f_u * f_n
Rater params (i_u, f_u) and mu are frozen from the global fit. For one note we
solve a 2x2 ridge problem for (i_n, f_n). The web app has a TypeScript port of
exactly this function (web/lib/model.ts) and is unit-tested against it.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Sequence

import numpy as np

Verdict = Literal["HELPFUL", "NOT_HELPFUL", "UNDECIDED"]


@dataclass(frozen=True)
class ModelParams:
    mu: float
    lambda_intercept: float = 1.5
    lambda_factor: float = 0.3
    helpful_intercept_min: float = 0.40
    not_helpful_intercept_max: float = -0.05
    max_abs_factor: float = 0.5
    min_ratings: int = 5


def refit_note(values: np.ndarray, rater_i: np.ndarray, rater_f: np.ndarray, p: ModelParams) -> tuple[float, float]:
    """Return (i_n, f_n) minimising
    sum (y - i_n - f_u f_n)^2 + lambda_i i_n^2 + lambda_f f_n^2, where y = r - mu - i_u."""
    if len(values) == 0:
        return 0.0, 0.0
    y = values - p.mu - rater_i
    f = rater_f
    n = float(len(values))
    a11 = n + p.lambda_intercept
    a12 = float(f.sum())
    a22 = float((f * f).sum()) + p.lambda_factor
    b1 = float(y.sum())
    b2 = float((f * y).sum())
    det = a11 * a22 - a12 * a12
    i_n = (a22 * b1 - a12 * b2) / det
    f_n = (a11 * b2 - a12 * b1) / det
    return i_n, f_n


def verdict(i_n: float, f_n: float, n_ratings: int, p: ModelParams) -> Verdict:
    if n_ratings < p.min_ratings:
        return "UNDECIDED"
    if i_n >= p.helpful_intercept_min and abs(f_n) < p.max_abs_factor:
        return "HELPFUL"
    if i_n <= p.not_helpful_intercept_max:
        return "NOT_HELPFUL"
    return "UNDECIDED"


def verdict_path(values: np.ndarray, rater_i: np.ndarray, rater_f: np.ndarray, p: ModelParams) -> list[Verdict]:
    """Verdict after each prefix 1..n of the given ordering."""
    out: list[Verdict] = []
    for k in range(1, len(values) + 1):
        i_n, f_n = refit_note(values[:k], rater_i[:k], rater_f[:k], p)
        out.append(verdict(i_n, f_n, k, p))
    return out


def k_to_stable(path: Sequence[Verdict], final: Verdict) -> int | None:
    """Smallest K such that verdicts K..n all equal `final` (1-based). None if final is UNDECIDED."""
    if final == "UNDECIDED" or not path or path[-1] != final:
        return None
    k = len(path)
    while k > 1 and path[k - 2] == final:
        k -= 1
    return k


def targeted_order(rater_f: np.ndarray) -> list[int]:
    """Our ordering. Uses only rater factors, never the ratings themselves.
    Next pick: from the factor sign with less accumulated |f_u| so far, the rater with the
    largest |f_u|. Ties go to the negative side (A)."""
    remaining = set(range(len(rater_f)))
    mass = {-1: 0.0, 1: 0.0}
    order: list[int] = []
    while remaining:
        want = -1 if mass[-1] <= mass[1] else 1
        pool = [j for j in remaining if (1 if rater_f[j] > 0 else -1) == want] or list(remaining)
        j = max(pool, key=lambda j: (abs(rater_f[j]), -j))
        order.append(j)
        remaining.remove(j)
        mass[1 if rater_f[j] > 0 else -1] += abs(rater_f[j])
    return order


def replay_note(values, rater_i, rater_f, p: ModelParams, n_shuffles: int = 50, seed: int = 0) -> dict:
    """values/rater_i/rater_f must be in actual time order."""
    values, rater_i, rater_f = map(np.asarray, (values, rater_i, rater_f))
    i_all, f_all = refit_note(values, rater_i, rater_f, p)
    final = verdict(i_all, f_all, len(values), p)

    k_actual = k_to_stable(verdict_path(values, rater_i, rater_f, p), final)

    rng = np.random.default_rng(seed)
    ks = []
    for _ in range(n_shuffles):
        perm = rng.permutation(len(values))
        ks.append(k_to_stable(verdict_path(values[perm], rater_i[perm], rater_f[perm], p), final))
    ks_valid = [k for k in ks if k is not None]
    k_random = float(np.median(ks_valid)) if ks_valid else None

    order = targeted_order(rater_f)
    o = np.array(order, dtype=int)
    k_targeted = k_to_stable(verdict_path(values[o], rater_i[o], rater_f[o], p), final)

    return {
        "finalVerdict": final,
        "intercept": i_all,
        "factor": f_all,
        "kActual": k_actual,
        "kRandomMedian": k_random,
        "kTargeted": k_targeted,
        "targetedOrder": order,
    }
