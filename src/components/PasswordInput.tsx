
import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Check, X, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PasswordRequirement {
  text: string;
  regex: RegExp;
}

const passwordRequirements: PasswordRequirement[] = [
  { text: 'At least 8 characters', regex: /.{8,}/ },
  { text: 'Lowercase letter (a-z)', regex: /[a-z]/ },
  { text: 'Uppercase letter (A-Z)', regex: /[A-Z]/ },
  { text: 'Number (0-9)', regex: /[0-9]/ },
  { text: 'Special character (!@#$%^&*)', regex: /[!@#$%^&*]/ },
];

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  id: string;
  label: string;
  isConfirm?: boolean;
  originalPassword?: string;
  required?: boolean;
  onBlur?: () => void;
  autoComplete?: string;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  value,
  onChange,
  id,
  label,
  isConfirm = false,
  originalPassword = '',
  required = false,
  onBlur,
  autoComplete,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [strength, setStrength] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  const generateStrongPassword = () => {
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const special = '!@#$%^&*';
    
    let password = '';
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];
    
    // Add random characters to make it longer
    const allChars = lowercase + uppercase + numbers + special;
    for (let i = 0; i < 8; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    // Shuffle the password
    password = password.split('').sort(() => Math.random() - 0.5).join('');
    onChange(password);
  };

  const togglePasswordVisibility = () => setShowPassword(!showPassword);

  useEffect(() => {
    if (!isConfirm) {
      const meetsRequirements = passwordRequirements.filter(req => 
        req.regex.test(value)
      ).length;
      setStrength((meetsRequirements / passwordRequirements.length) * 100);
    }
  }, [value, isConfirm]);

  const getStrengthColor = () => {
    if (strength <= 25) return 'bg-red-500';
    if (strength <= 50) return 'bg-orange-500';
    if (strength <= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div>
      <Label htmlFor={id} className="text-left block py-1">{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setHasInteracted(true);
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            onBlur?.();
          }}
          required={required}
          autoComplete={autoComplete}
          className="pr-20 text-sm"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {!isConfirm && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={generateStrongPassword}
              title="Generate Strong Password"
            >
              <Sparkles className="h-4 w-4" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={togglePasswordVisibility}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {!isConfirm && (isFocused || (hasInteracted && value)) && (
        <>
          {value && (
            <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden mt-2">
              <div
                className={cn("h-full transition-all", getStrengthColor())}
                style={{ width: `${strength}%` }}
              />
            </div>
          )}
          {(isFocused || (hasInteracted && value && strength < 100)) && (
            <div className="space-y-1 text-xs mt-2">
              {passwordRequirements.map((req, index) => {
                const isValid = req.regex.test(value);
                if (isValid && !isFocused) return null;
                return (
                  <div key={index} className={cn(
                    "flex items-center gap-2 transition-all",
                    isValid ? "opacity-50" : "opacity-100"
                  )}>
                    {isValid ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <X className="h-3 w-3 text-red-500" />
                    )}
                    <span className={cn(
                      isValid ? "text-gray-500 line-through" : "text-gray-700"
                    )}>{req.text}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {isConfirm && (
        <div className="flex items-center gap-2 text-sm mt-2">
          {value && (
            <>
              {value === originalPassword ? (
                <>
                  <Check className="h-4 w-4 text-green-500" />
                  <span className="text-green-500">Passwords match</span>
                </>
              ) : (
                <>
                  <X className="h-4 w-4 text-red-500" />
                  <span className="text-red-500">Passwords don't match</span>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
