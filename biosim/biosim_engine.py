"""BioSim Engine v0.2 - closed-loop experiment & simulation engine
Monte Carlo | mutation randomization | sequencing simulator | CAR-T dynamics | recursive learning
"""
import numpy as np
from dataclasses import dataclass

@dataclass
class Params:
    gens: int = 60
    growth: float = 1.30
    mu_driver: float = 1e-4
    driver_boost: float = 0.01
    f_cap: float = 1.10
    capacity: int = 200_000
    car_t_dose: float = 3e5
    kill_rate: float = 0.9
    kill_mult: float = 0.05
    kill_cap: float = 0.6
    effector_tau: float = 4.0
    t_start: int = 14

class BioSimEngine:
    def __init__(self, p: Params, seed=0):
        self.p, self.rng = p, np.random.default_rng(seed)
        self.mu_log_mean, self.mu_log_var = np.log(2e-5), 0.5

    def _mu(self):
        return float(np.exp(self.rng.normal(self.mu_log_mean, np.sqrt(self.mu_log_var))))

    def run_trial(self, dose=None):
        p, rng = self.p, self.rng
        dose = dose or p.car_t_dose
        n, f, ag = 200, 1.0, 1.0
        mu_ag = self._mu()
        extinct_at, recurrent_at, nadir = None, None, None
        traj = []
        for g in range(p.gens):
            n = int(min(n * p.growth * f, p.capacity))
            if rng.random() < p.mu_driver * n:
                f = min(f * (1 + p.driver_boost), p.f_cap)
            nag = rng.poisson(mu_ag * n)
            if nag: ag = max(0.0, ag - nag / n)
            if g >= p.t_start:
                eff = dose * np.exp(-(g - p.t_start) / p.effector_tau)
                k = min(p.kill_cap, p.kill_rate * p.kill_mult * eff / max(n, 1))
                n_surv = n * (1 - ag * k)
                ag = ag * (1 - k) / (1 - ag * k + 1e-12)
                n = max(0, int(n_surv))
                if nadir is None: nadir = n
            traj.append(n)
            if n < 10: extinct_at = g; break
            if (recurrent_at is None and nadir is not None and g > p.t_start + 2
                    and n > max(500, 3 * nadir)):
                recurrent_at = g
        return dict(final=n, extinct=extinct_at, recurred=recurrent_at,
                    agneg=1 - ag, mu=mu_ag, nadir=nadir, dose=dose, traj=traj)

    def monte_carlo(self, n_trials, dose=None):
        return [self.run_trial(dose) for _ in range(n_trials)]

    def sequence(self, t, depth=300):
        vaf = t['agneg'] / 2
        alt = self.rng.binomial(depth, min(vaf + 0.005, 1.0))
        thr = 2 * np.sqrt(0.005 * 0.995 / depth)
        return dict(vaf_true=vaf, vaf_obs=alt/depth, detected=(alt/depth) > thr)

    def learn(self, trials):
        rec = np.mean([t['recurred'] is not None for t in trials])
        self.mu_log_mean += 0.3 * (rec - 0.5)
        self.mu_log_var = max(0.05, self.mu_log_var * 0.9)
        return rec

if __name__ == "__main__":
    eng = BioSimEngine(Params())
    for d in [1e5, 3e5, 1e6]:
        res = eng.monte_carlo(200, dose=d)
        cures = np.mean([t['extinct'] is not None for t in res])
        print(f"dose {d:.0e}: cure {cures:.0%}")
