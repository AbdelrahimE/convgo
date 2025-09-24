/**
 * Enhanced Business Name Validation Utilities
 * Provides intelligent validation for business names with industry standards
 */

export interface BusinessNameValidationResult {
  isValid: boolean;
  error?: string;
  warning?: string;
  suggestions?: string[];
  confidence: number; // 0-100
}

// Common business suffixes and their variations
const BUSINESS_SUFFIXES = [
  // US/International
  { suffix: 'LLC', variations: ['L.L.C', 'L.L.C.', 'Limited Liability Company'] },
  { suffix: 'Inc', variations: ['Inc.', 'Incorporated', 'Corporation'] },
  { suffix: 'Corp', variations: ['Corp.', 'Corporation'] },
  { suffix: 'Ltd', variations: ['Ltd.', 'Limited'] },
  { suffix: 'LLP', variations: ['L.L.P', 'L.L.P.', 'Limited Liability Partnership'] },
  { suffix: 'LP', variations: ['L.P', 'L.P.', 'Limited Partnership'] },
  { suffix: 'Co', variations: ['Co.', 'Company'] },
  { suffix: 'SA', variations: ['S.A.', 'Société Anonyme'] },
  { suffix: 'SRL', variations: ['S.R.L.', 'Società a Responsabilità Limitata'] },
  { suffix: 'GmbH', variations: ['G.m.b.H.'] },
  { suffix: 'AG', variations: ['A.G.'] },
  { suffix: 'BV', variations: ['B.V.'] },
  { suffix: 'NV', variations: ['N.V.'] },
  // Additional
  { suffix: 'Group', variations: ['Grp', 'Grp.'] },
  { suffix: 'Holdings', variations: ['Holding', 'Hold'] },
  { suffix: 'Enterprises', variations: ['Enterprise', 'Ent'] },
  { suffix: 'Solutions', variations: ['Solution', 'Sol'] },
  { suffix: 'Services', variations: ['Service', 'Svc'] },
  { suffix: 'Technologies', variations: ['Technology', 'Tech'] },
  { suffix: 'Industries', variations: ['Industry', 'Ind'] },
  { suffix: 'International', variations: ['Intl', 'Int\'l'] }
];

// Industry keywords for context-aware validation
const INDUSTRY_KEYWORDS = {
  technology: ['Tech', 'Software', 'Digital', 'Cyber', 'Data', 'Cloud', 'AI', 'IT', 'Systems'],
  healthcare: ['Health', 'Medical', 'Care', 'Clinic', 'Hospital', 'Wellness', 'Pharma'],
  finance: ['Finance', 'Financial', 'Bank', 'Investment', 'Capital', 'Fund', 'Credit'],
  retail: ['Retail', 'Store', 'Shop', 'Market', 'Mall', 'Commerce', 'Trade'],
  construction: ['Construction', 'Build', 'Contractor', 'Engineering', 'Architect'],
  consulting: ['Consulting', 'Advisory', 'Partners', 'Associates', 'Advisors'],
  manufacturing: ['Manufacturing', 'Industrial', 'Factory', 'Production', 'Assembly'],
  education: ['Education', 'Learning', 'Training', 'Academy', 'Institute', 'School']
};

// Reserved/problematic words
const RESTRICTED_WORDS = [
  'Government', 'Federal', 'National', 'State', 'Official', 'Public',
  'Bank', 'Banking', 'Insurance', 'Trust', 'Credit Union', 'Savings',
  'University', 'College', 'Institute', 'Academy', 'School',
  'Hospital', 'Medical Center', 'Clinic',
  'Police', 'FBI', 'CIA', 'IRS', 'NASA', 'Military'
];

// Common problematic characters
const PROBLEMATIC_CHARS = /[<>\"'&\\\/\{\}\[\]]/g;
const EXCESSIVE_SPECIAL_CHARS = /[!@#$%^*()+=~`|;:,<>?]{3,}/g;

/**
 * Detects business suffix in name
 */
function detectBusinessSuffix(businessName: string): { 
  hasSuffix: boolean; 
  suffix?: string; 
  normalized?: string;
  suggestions?: string[];
} {
  const name = businessName.trim();
  const nameLower = name.toLowerCase();
  
  for (const { suffix, variations } of BUSINESS_SUFFIXES) {
    // Check main suffix
    if (nameLower.endsWith(suffix.toLowerCase())) {
      return { 
        hasSuffix: true, 
        suffix, 
        normalized: name 
      };
    }
    
    // Check variations
    for (const variation of variations) {
      if (nameLower.endsWith(variation.toLowerCase())) {
        return { 
          hasSuffix: true, 
          suffix: variation, 
          normalized: name 
        };
      }
    }
  }
  
  // Suggest common suffixes if none found and name doesn't seem personal
  const suggestions = [];
  if (!hasPersonalNamePattern(name)) {
    suggestions.push(`${name} LLC`, `${name} Inc`, `${name} Corp`);
  }
  
  return { 
    hasSuffix: false, 
    suggestions: suggestions.slice(0, 3) 
  };
}

/**
 * Checks if name follows personal name pattern (likely not a business)
 */
function hasPersonalNamePattern(name: string): boolean {
  const words = name.trim().split(/\s+/);
  
  // First Last name pattern
  if (words.length === 2) {
    return words.every(word => /^[A-Z][a-z]+$/.test(word));
  }
  
  // First Middle Last name pattern
  if (words.length === 3) {
    return words.every(word => /^[A-Z][a-z]+$/.test(word));
  }
  
  return false;
}

/**
 * Detects industry context from business name
 */
function detectIndustry(businessName: string): string | null {
  const nameLower = businessName.toLowerCase();
  
  for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (nameLower.includes(keyword.toLowerCase())) {
        return industry;
      }
    }
  }
  
  return null;
}

/**
 * Checks for restricted words
 */
function hasRestrictedWords(businessName: string): { 
  hasRestricted: boolean; 
  restrictedWords: string[];
} {
  const nameLower = businessName.toLowerCase();
  const foundRestricted: string[] = [];
  
  for (const restricted of RESTRICTED_WORDS) {
    if (nameLower.includes(restricted.toLowerCase())) {
      foundRestricted.push(restricted);
    }
  }
  
  return {
    hasRestricted: foundRestricted.length > 0,
    restrictedWords: foundRestricted
  };
}

/**
 * Validates character usage
 */
function validateCharacters(businessName: string): {
  isValid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  // Check for problematic characters
  if (PROBLEMATIC_CHARS.test(businessName)) {
    issues.push('Contains invalid characters like < > \" \' & \\ /');
  }
  
  // Check for excessive special characters
  if (EXCESSIVE_SPECIAL_CHARS.test(businessName)) {
    issues.push('Contains too many consecutive special characters');
  }
  
  // Check for non-printable characters
  if (/[\x00-\x1F\x7F]/.test(businessName)) {
    issues.push('Contains non-printable characters');
  }
  
  // Check for excessive spaces
  if (/\s{3,}/.test(businessName)) {
    issues.push('Contains excessive spaces');
  }
  
  return {
    isValid: issues.length === 0,
    issues
  };
}

/**
 * Calculates business name confidence score
 */
function calculateConfidence(businessName: string, hasIssues: boolean): number {
  let confidence = 100;
  
  const { hasSuffix } = detectBusinessSuffix(businessName);
  const industry = detectIndustry(businessName);
  const isPersonalName = hasPersonalNamePattern(businessName);
  const words = businessName.trim().split(/\s+/);
  
  // Deduct for issues
  if (hasIssues) confidence -= 30;
  
  // Deduct if looks like personal name
  if (isPersonalName) confidence -= 25;
  
  // Add for business suffix
  if (hasSuffix) confidence += 15;
  
  // Add for industry context
  if (industry) confidence += 10;
  
  // Deduct for too short/long
  if (businessName.length < 5) confidence -= 20;
  if (businessName.length > 100) confidence -= 15;
  
  // Deduct for single word without suffix
  if (words.length === 1 && !hasSuffix) confidence -= 15;
  
  // Deduct for all caps or all lowercase
  if (businessName === businessName.toUpperCase()) confidence -= 10;
  if (businessName === businessName.toLowerCase()) confidence -= 10;
  
  return Math.max(0, Math.min(100, confidence));
}

/**
 * Enhanced business name validation with intelligent suggestions
 */
export function validateBusinessNameEnhanced(businessName: string): BusinessNameValidationResult {
  const trimmedName = businessName.trim();
  
  // Basic validations first
  if (!trimmedName) {
    return {
      isValid: false,
      error: 'Business name is required',
      confidence: 0
    };
  }
  
  if (trimmedName.length < 2) {
    return {
      isValid: false,
      error: 'Business name must be at least 2 characters long',
      confidence: 10
    };
  }
  
  if (trimmedName.length > 200) {
    return {
      isValid: false,
      error: 'Business name is too long (maximum 200 characters)',
      confidence: 20
    };
  }
  
  // Character validation
  const charValidation = validateCharacters(trimmedName);
  if (!charValidation.isValid) {
    return {
      isValid: false,
      error: `Invalid characters: ${charValidation.issues.join(', ')}`,
      confidence: 25
    };
  }
  
  // Restricted words check
  const restrictedCheck = hasRestrictedWords(trimmedName);
  if (restrictedCheck.hasRestricted) {
    return {
      isValid: false,
      error: `Contains restricted words: ${restrictedCheck.restrictedWords.join(', ')}. These may require special licensing.`,
      confidence: 30
    };
  }
  
  // Advanced validations
  const suffixInfo = detectBusinessSuffix(trimmedName);
  const industry = detectIndustry(trimmedName);
  const isPersonalName = hasPersonalNamePattern(trimmedName);
  
  const confidence = calculateConfidence(trimmedName, false);
  const warnings: string[] = [];
  const suggestions: string[] = [];
  
  // Personal name warning
  if (isPersonalName) {
    warnings.push('This looks like a personal name. Consider adding a business suffix like LLC or Inc.');
    if (suffixInfo.suggestions) {
      suggestions.push(...suffixInfo.suggestions);
    }
  }
  
  // No business suffix warning (for non-personal names)
  if (!suffixInfo.hasSuffix && !isPersonalName && trimmedName.split(/\s+/).length > 1) {
    warnings.push('Consider adding a business suffix (LLC, Inc, Corp, etc.) for legal clarity.');
    suggestions.push(`${trimmedName} LLC`, `${trimmedName} Inc`);
  }
  
  // Industry context info
  if (industry) {
    warnings.push(`Detected as ${industry} industry. Ensure compliance with industry-specific naming regulations.`);
  }
  
  // Single word business name
  if (trimmedName.split(/\s+/).length === 1 && !suffixInfo.hasSuffix) {
    warnings.push('Single-word business names may be harder to trademark. Consider adding descriptive words.');
  }
  
  return {
    isValid: true,
    warning: warnings.length > 0 ? warnings[0] : undefined,
    suggestions: suggestions.slice(0, 3),
    confidence
  };
}

/**
 * Quick business name validation (for real-time use)
 */
export function validateBusinessNameQuick(businessName: string): BusinessNameValidationResult {
  const trimmedName = businessName.trim();
  
  if (!trimmedName) {
    return { isValid: false, error: 'Business name is required', confidence: 0 };
  }
  
  if (trimmedName.length < 2) {
    return { isValid: false, error: 'Business name too short', confidence: 10 };
  }
  
  if (trimmedName.length > 200) {
    return { isValid: false, error: 'Business name too long', confidence: 20 };
  }
  
  const charValidation = validateCharacters(trimmedName);
  if (!charValidation.isValid) {
    return { isValid: false, error: 'Contains invalid characters', confidence: 25 };
  }
  
  const confidence = calculateConfidence(trimmedName, false);
  
  return { isValid: true, confidence };
}

/**
 * Suggests business name improvements
 */
export function suggestBusinessNameImprovements(businessName: string): string[] {
  const suggestions: string[] = [];
  const trimmedName = businessName.trim();
  
  if (!trimmedName) return suggestions;
  
  const suffixInfo = detectBusinessSuffix(trimmedName);
  const isPersonalName = hasPersonalNamePattern(trimmedName);
  
  // Add business suffixes if none
  if (!suffixInfo.hasSuffix) {
    suggestions.push(`${trimmedName} LLC`);
    suggestions.push(`${trimmedName} Inc`);
    if (!isPersonalName) {
      suggestions.push(`${trimmedName} Group`);
      suggestions.push(`${trimmedName} Solutions`);
    }
  }
  
  // Capitalize properly if needed
  if (trimmedName === trimmedName.toLowerCase() || trimmedName === trimmedName.toUpperCase()) {
    const properCase = trimmedName.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
    suggestions.push(properCase);
  }
  
  return suggestions.slice(0, 5);
}