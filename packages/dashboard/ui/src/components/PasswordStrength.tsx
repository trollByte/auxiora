interface PasswordStrengthProps {
  password: string;
}

function getStrength(password: string): { label: string; color: string; width: string } {
  if (password.length === 0) return { label: '', color: 'transparent', width: '0%' };
  if (password.length < 8) return { label: 'Too short', color: 'var(--danger)', width: '25%' };

  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const variety = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;

  if (password.length >= 12 && variety >= 3) return { label: 'Strong', color: 'var(--success)', width: '100%' };
  return { label: 'Fair', color: 'var(--warning)', width: '60%' };
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const strength = getStrength(password);
  if (!password) return null;

  return (
    <>
      <div className="password-strength">
        <div className="password-strength-bar" style={{ width: strength.width, background: strength.color }} />
      </div>
      <div className="password-strength-label" style={{ color: strength.color }}>{strength.label}</div>
    </>
  );
}
