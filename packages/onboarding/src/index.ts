export type {
  OnboardingAnswers,
  OnboardingStep,
  OnboardingChoice,
  OnboardingVariant,
  DesktopOnboardingStep,
  DesktopOnboardingAnswers,
} from './types.js';
export { OnboardingWizard } from './wizard.js';
export { DesktopOnboardingWizard } from './desktop-wizard.js';
export { applyOnboarding, applyDesktopOnboarding, type ApplyResult, type DesktopApplyResult } from './apply.js';
export { PreferenceBootstrap } from './preference-bootstrap.js';
export type { PreferenceProfile } from './preference-bootstrap.js';
