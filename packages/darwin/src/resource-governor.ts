export interface ResourceGovernorOptions {
  tokenBudgetPerHour: number;
  maxVariantsPerDay: number;
  pauseDuringUserActivity: boolean;
  userActivityTimeoutMs?: number;
}

export interface GovernorStats {
  tokensUsedThisHour: number;
  tokenBudgetRemaining: number;
  variantsCreatedToday: number;
  variantsRemainingToday: number;
  paused: boolean;
  pauseReason?: string;
}

const DEFAULT_ACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
const HOUR_MS = 3_600_000;

function dayStartFor(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export class ResourceGovernor {
  private readonly tokenBudgetPerHour: number;
  private readonly maxVariantsPerDay: number;
  private readonly pauseDuringUserActivity: boolean;
  private readonly activityTimeoutMs: number;

  private tokensUsedThisHour = 0;
  private hourWindowStart: number;
  private variantsCreatedToday = 0;
  private dayStart: number;
  private lastUserActivity = 0;

  constructor(options: ResourceGovernorOptions) {
    this.tokenBudgetPerHour = options.tokenBudgetPerHour;
    this.maxVariantsPerDay = options.maxVariantsPerDay;
    this.pauseDuringUserActivity = options.pauseDuringUserActivity;
    this.activityTimeoutMs = options.userActivityTimeoutMs ?? DEFAULT_ACTIVITY_TIMEOUT_MS;

    const now = Date.now();
    this.hourWindowStart = now;
    this.dayStart = dayStartFor(now);
  }

  canRunCycle(): boolean {
    this.maybeResetWindows();
    const stats = this.getStats();
    return !stats.paused;
  }

  recordTokenUsage(tokens: number): void {
    this.maybeResetWindows();
    this.tokensUsedThisHour += tokens;
  }

  recordVariantCreated(): void {
    this.maybeResetWindows();
    this.variantsCreatedToday += 1;
  }

  recordUserActivity(): void {
    this.lastUserActivity = Date.now();
  }

  setLastUserActivity(timestamp: number): void {
    this.lastUserActivity = timestamp;
  }

  resetHourlyBudget(): void {
    this.tokensUsedThisHour = 0;
    this.hourWindowStart = Date.now();
  }

  resetDailyCount(): void {
    this.variantsCreatedToday = 0;
    this.dayStart = dayStartFor(Date.now());
  }

  getStats(): GovernorStats {
    this.maybeResetWindows();

    const tokenBudgetRemaining = Math.max(0, this.tokenBudgetPerHour - this.tokensUsedThisHour);
    const variantsRemainingToday = Math.max(0, this.maxVariantsPerDay - this.variantsCreatedToday);

    let paused = false;
    let pauseReason: string | undefined;

    if (this.tokensUsedThisHour >= this.tokenBudgetPerHour) {
      paused = true;
      pauseReason = 'token budget exceeded';
    } else if (this.variantsCreatedToday >= this.maxVariantsPerDay) {
      paused = true;
      pauseReason = 'daily variant cap reached';
    } else if (this.pauseDuringUserActivity && this.isUserActive()) {
      paused = true;
      pauseReason = 'user is active';
    }

    return {
      tokensUsedThisHour: this.tokensUsedThisHour,
      tokenBudgetRemaining,
      variantsCreatedToday: this.variantsCreatedToday,
      variantsRemainingToday,
      paused,
      pauseReason,
    };
  }

  private isUserActive(): boolean {
    if (this.lastUserActivity === 0) return false;
    return Date.now() - this.lastUserActivity < this.activityTimeoutMs;
  }

  private maybeResetWindows(): void {
    const now = Date.now();
    if (now - this.hourWindowStart >= HOUR_MS) {
      this.tokensUsedThisHour = 0;
      this.hourWindowStart = now;
    }
    const currentDayStart = dayStartFor(now);
    if (currentDayStart !== this.dayStart) {
      this.variantsCreatedToday = 0;
      this.dayStart = currentDayStart;
    }
  }
}
