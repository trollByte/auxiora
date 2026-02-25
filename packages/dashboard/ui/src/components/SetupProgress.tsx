interface SetupProgressProps {
  currentStep: number;
  totalSteps?: number;
}

export function SetupProgress({ currentStep, totalSteps = 8 }: SetupProgressProps) {
  return (
    <div className="setup-progress">
      {Array.from({ length: totalSteps }, (_, i) => {
        const step = i + 1;
        const isCompleted = step < currentStep;
        const isActive = step === currentStep;
        return (
          <div key={step} style={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && (
              <div className={`setup-progress-line${isCompleted || isActive ? ' completed' : ''}`} />
            )}
            <div className={`setup-progress-step${isActive ? ' active' : ''}${isCompleted ? ' completed' : ''}`}>
              {isCompleted ? '\u2713' : step}
            </div>
          </div>
        );
      })}
    </div>
  );
}
