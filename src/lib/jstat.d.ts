/**
 * Minimal ambient typings for `jstat` (CJS, ships no .d.ts). Only the
 * distribution functions statistics.ts relies on are declared.
 */
declare module 'jstat' {
  interface NormalDist {
    cdf(x: number, mean?: number, std?: number): number;
    inv(p: number, mean?: number, std?: number): number;
  }
  interface StudenttDist {
    cdf(x: number, dof: number): number;
    inv(p: number, dof: number): number;
  }
  interface ChisquareDist {
    cdf(x: number, dof: number): number;
  }
  interface HypgeomDist {
    pdf(k: number, N: number, m: number, n: number): number;
    cdf(x: number, N: number, m: number, n: number): number;
  }
  const jStat: {
    normal: NormalDist;
    studentt: StudenttDist;
    chisquare: ChisquareDist;
    hypgeom: HypgeomDist;
  };
  export default jStat;
}