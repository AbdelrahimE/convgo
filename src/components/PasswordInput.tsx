
import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Check, X } from 'lucide-react';
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
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  value,
  onChange,
  id,
  label,
  isConfirm = false,
  originalPassword = '',
  required = false,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [strength, setStrength] = useState(0);

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
    <div className="space-y-2">
      <Label htmlFor={id} className="text-left block py-[5px]">{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className="pr-20"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
          onClick={togglePasswordVisibility}
        >
          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>

      {!isConfirm && (
        <>
          <div className="space-y-2">
            <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
              <div
                className={cn("h-full transition-all", getStrengthColor())}
                style={{ width: `${strength}%` }}
              />
            </div>
            <div className="space-y-1">
              {passwordRequirements.map((req, index) => (
                <div key={index} className="flex items-center gap-2 text-sm">
                  {req.regex.test(value) ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <X className="h-4 w-4 text-red-500" />
                  )}
                  <span>{req.text}</span>
                </div>
              ))}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={generateStrongPassword}
            className="w-full mt-2"
          >
            Generate Strong Password
          </Button>
        </>
      )}

      {isConfirm && (
        <div className="flex items-center gap-2 text-sm mt-1">
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
