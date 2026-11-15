/** Running mean and variance (Welford). */
export class RunningStats {
  n = 0;
  private mean_ = 0;
  private m2 = 0;

  push(x: number): void {
    this.n += 1;
    const d = x - this.mean_;
    this.mean_ += d / this.n;
    this.m2 += d * (x - this.mean_);
  }

  get mean(): number {
    return this.mean_;
  }

  get variance(): number {
    return this.n > 1 ? this.m2 / (this.n - 1) : 0;
  }

  get stderr(): number {
    return this.n > 1 ? Math.sqrt(this.variance / this.n) : Number.POSITIVE_INFINITY;
  }

  /** 95% confidence interval for the mean (normal approximation). */
  get ci95(): readonly [number, number] {
    const h = 1.96 * this.stderr;
    return [this.mean_ - h, this.mean_ + h];
  }
}

export type SprtDecision = 'H1' | 'H0' | 'continue';

export interface SprtOptions {
  /** Mean under the null hypothesis (no improvement). */
  readonly mu0: number;
  /** Mean under the alternative (the improvement worth detecting). */
  readonly mu1: number;
  readonly alpha?: number;
  readonly beta?: number;
  /** Don't stop before this many samples (variance estimate needs a few). */
  readonly minSamples?: number;
}

/**
 * Sequential probability ratio test for a normal mean with estimated variance
 * (the "GSPRT" used by engine-testing frameworks). Feed paired duplicate scores one by one;
 * it stops as soon as the evidence favours H1 (A is at least mu1 better) or H0.
 */
export class Sprt {
  readonly stats = new RunningStats();
  private sum = 0;
  readonly lower: number;
  readonly upper: number;

  constructor(private readonly opts: SprtOptions) {
    const alpha = opts.alpha ?? 0.05;
    const beta = opts.beta ?? 0.05;
    this.lower = Math.log(beta / (1 - alpha));
    this.upper = Math.log((1 - beta) / alpha);
  }

  push(x: number): SprtDecision {
    this.stats.push(x);
    this.sum += x;
    return this.decision();
  }

  get llr(): number {
    const { mu0, mu1 } = this.opts;
    const n = this.stats.n;
    const v = Math.max(this.stats.variance, 1e-12);
    return ((mu1 - mu0) * this.sum - (n * (mu1 * mu1 - mu0 * mu0)) / 2) / v;
  }

  decision(): SprtDecision {
    if (this.stats.n < (this.opts.minSamples ?? 30)) return 'continue';
    const llr = this.llr;
    if (llr >= this.upper) return 'H1';
    if (llr <= this.lower) return 'H0';
    return 'continue';
  }
}
