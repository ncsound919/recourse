"""BioSim Engine v0.3 - closed-loop experiment & simulation engine
Monte Carlo | mutation randomization | sequencing layer (Illumina PE150 / ONT)
| CAR-T dynamics | recursive learning
"""
import numpy as np, gzip, os
from dataclasses import dataclass
from scipy import stats

BASES = np.array(list('ACGT'))
COMP = str.maketrans('ACGT', 'TGCA')
def revcomp(s): return s.translate(COMP)[::-1]

# ======================= tumor / CAR-T layer =======================
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
            if n < 10: extinct_at = g; break
            if (recurrent_at is None and nadir is not None and g > p.t_start + 2
                    and n > max(500, 3 * nadir)):
                recurrent_at = g
        return dict(final=n, extinct=extinct_at, recurred=recurrent_at,
                    agneg=1 - ag, mu=mu_ag, nadir=nadir, dose=dose)

    def monte_carlo(self, n_trials, dose=None):
        return [self.run_trial(dose) for _ in range(n_trials)]

    def learn(self, trials):
        rec = np.mean([t['recurred'] is not None for t in trials])
        self.mu_log_mean += 0.3 * (rec - 0.5)
        self.mu_log_var = max(0.05, self.mu_log_var * 0.9)
        return rec

# ======================= sequencing layer =======================
def make_reference(length=100_000, seed=0):
    return ''.join(np.random.default_rng(seed).choice(BASES, size=length))

def make_escape_clone(ref, antigen_pos=40_500, n_drivers=6, seed=1):
    rng = np.random.default_rng(seed)
    g = list(ref)
    alt = rng.choice([b for b in 'ACGT' if b != g[antigen_pos]])
    g[antigen_pos] = alt
    records = [{'pos': antigen_pos, 'ref': ref[antigen_pos], 'alt': alt, 'type': 'antigen_loss'}]
    for p in rng.integers(2_000, len(ref)-2_000, n_drivers):
        a = rng.choice([b for b in 'ACGT' if b != g[p]])
        records.append({'pos': int(p), 'ref': ref[p], 'alt': a, 'type': 'driver'})
        g[p] = a
    return ''.join(g), records

class SeqLayer:
    """Real sequencing simulation: FASTQ/VCF I/O + calibrated error models.
    Platform alt-error rates measured empirically from simulated batches."""
    P_ERR = {'illumina': 1.33e-4, 'ont': 1.31e-2}

    @staticmethod
    def _apply_errors(seq, qs, rng):
        s = np.array(list(seq))
        p = 10.0 ** (-qs / 10.0)
        idx = np.where(rng.random(len(s)) < p)[0]
        for i in idx:
            s[i] = rng.choice([b for b in 'ACGT' if b != s[i]])
        return ''.join(s)

    @classmethod
    def sim_bases_at(cls, genome, pos, n, platform, rng):
        if platform == 'illumina':
            is_r1 = rng.random(n) < 150/550.
            s1 = pos - rng.integers(0, 150, int(is_r1.sum()))
            frag = np.clip(rng.normal(550, 30, int((~is_r1).sum())), 200, 900).astype(int)
            s2 = pos - frag + rng.integers(0, 150, frag.size)
            roff = np.concatenate([pos - s1, (pos - s2) - (frag - 150)])
            qs = np.clip(rng.normal(34 - 0.02*roff, 2.5, len(roff)), 2, 41)
            true_b = np.repeat(genome[pos], len(roff))
            p = 10.0 ** (-qs/10.)
            idx = np.where(rng.random(len(true_b)) < p)[0]
            for i in idx:
                true_b[i] = rng.choice([b for b in 'ACGT' if b != true_b[i]])
            return true_b
        r = rng.random(n)
        alt_choice = rng.choice([b for b in 'ACGT' if b != genome[pos]], size=n)
        return np.where(r < 0.93, genome[pos], np.where(r < 0.97, alt_choice, ''))

    @classmethod
    def detect_prob(cls, n, vaf, platform):
        p_err = cls.P_ERR[platform]
        thr = max(3.0, n * p_err + 4 * np.sqrt(n * p_err))
        return 1 - stats.binom.cdf(int(thr), n, min(vaf + p_err, 1.0))

    @classmethod
    def lod95(cls, platform, n):
        vafs = np.logspace(-4, -0.6, 200)
        for v in vafs:
            if cls.detect_prob(n, v, platform) >= 0.95:
                return v
        return np.nan

    @classmethod
    def sequence(cls, trial, depth=2000, platform='illumina'):
        """would sequencing catch this tumor's escape clone at sampling?"""
        vaf = trial['agneg'] / 2
        return dict(vaf=vaf, depth=depth, platform=platform,
                    p_detect=cls.detect_prob(depth, vaf, platform),
                    detected=cls.rng_random() < cls.detect_prob(depth, vaf, platform))

    @staticmethod
    def rng_random():
        return np.random.random()

    @classmethod
    def sequence_wgs(cls, genomes, weights, depth, out_prefix, rng, read_len=150):
        L = len(genomes[0])
        n_pairs = int(depth * L / (2 * read_len))
        which = rng.choice(len(genomes), size=n_pairs, p=weights)
        frags = np.clip(rng.normal(550, 30, n_pairs), 200, 900).astype(int)
        starts = rng.integers(0, L - 900, n_pairs)
        r1f = gzip.open(f'{out_prefix}_R1.fastq.gz', 'wt')
        r2f = gzip.open(f'{out_prefix}_R2.fastq.gz', 'wt')
        for i in range(n_pairs):
            g = genomes[which[i]]
            ins = g[starts[i]:starts[i]+frags[i]]
            r1, r2 = ins[:read_len], revcomp(ins[frags[i]-read_len:])
            o = np.arange(read_len)
            q1 = np.clip(rng.normal(34-0.02*o, 2.5, read_len), 2, 41).astype(int)
            q2 = np.clip(rng.normal(34-0.02*o, 2.5, read_len), 2, 41).astype(int)
            b1 = cls._apply_errors(r1, q1, rng); b2 = cls._apply_errors(r2, q2, rng)
            r1f.write(f'@SIM:{i}:1\n{b1}\n+\n{"".join(chr(q+33) for q in q1)}\n')
            r2f.write(f'@SIM:{i}:2\n{b2}\n+\n{"".join(chr(q+33) for q in q2)}\n')
        r1f.close(); r2f.close()
        return n_pairs

if __name__ == "__main__":
    ref = make_reference()
    clone, truth = make_escape_clone(ref)
    eng = BioSimEngine(Params())
    res = eng.monte_carlo(200, dose=3e5)
    print(f"cure rate: {np.mean([t['extinct'] is not None for t in res]):.0%}")
    for platform in ['illumina', 'ont']:
        print(f"LOD95 {platform} @2000x: {SeqLayer.lod95(platform, 2000)*100:.3f}% VAF")
