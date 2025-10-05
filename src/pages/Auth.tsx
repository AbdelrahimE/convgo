import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Wifi, WifiOff, Signal } from 'lucide-react';
import logger from '@/utils/logger';
import { getSignInErrorMessage, getSignUpErrorMessage, getPasswordResetErrorMessage, logAuthError } from '@/utils/authErrors';
import { withNetworkAwareAuth, NetworkMonitor } from '@/utils/networkHandling';
import {
  validateEmail,
  validateLoginPassword,
  validateRegistrationPassword,
  validatePasswordConfirmation,
  validateFullName,
  validateBusinessName,
  validateLoginForm,
  validateRegistrationForm,
  hasValidationErrors,
  type FormErrors
} from '@/utils/formValidation';
import { suggestBusinessNameImprovements, validateBusinessNameEnhanced } from '@/utils/businessNameValidation';
import { PasswordInput } from '@/components/PasswordInput';
import GoogleSignInButton from '@/components/auth/GoogleSignInButton';
import AuthDivider from '@/components/auth/AuthDivider';
import TermsAndPrivacy from '@/components/auth/TermsAndPrivacy';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';

interface AuthProps {
  isResetPasswordMode?: boolean;
}

export default function Auth({ isResetPasswordMode = false }: AuthProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [activeTab, setActiveTab] = useState('signin');
  const [isResetMode, setIsResetMode] = useState(false);
  
  // Validation states
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [businessNameSuggestions, setBusinessNameSuggestions] = useState<string[]>([]);
  
  // Network status
  const [isOffline, setIsOffline] = useState(false);
  const [isSlowConnection, setIsSlowConnection] = useState(false);

  useEffect(() => {
    // Set reset mode if coming from reset password route or URL parameter
    if (isResetPasswordMode) {
      setIsResetMode(true);
      
      // Check if there are recovery tokens in the URL hash
      const hash = window.location.hash;
      if (hash && hash.includes('access_token')) {
        // This is a recovery session - mark it in localStorage
        localStorage.setItem('pendingPasswordReset', 'true');
        logger.info('Recovery tokens detected - user must reset password');
      }
    } else {
      const params = new URLSearchParams(location.search);
      if (params.get('reset') === 'true') {
        setIsResetMode(true);
      }
    }
  }, [location, isResetPasswordMode]);

  // Validation for reset password mode - ensure user has valid session
  useEffect(() => {
    if (isResetPasswordMode && !authLoading && !session) {
      logger.warn('Reset password mode accessed without valid session');
      toast.error('Session Expired', {
        description: 'Your password reset session has expired. Please request a new password reset link.'
      });
      
      // Redirect to regular auth page
      setTimeout(() => {
        navigate('/auth');
      }, 3000);
    }
  }, [isResetPasswordMode, session, authLoading, navigate]);

  // Network monitoring
  useEffect(() => {
    const networkMonitor = new NetworkMonitor();
    
    const cleanup = networkMonitor.onStatusChange((status) => {
      setIsOffline(!status.isOnline);
      setIsSlowConnection(status.isSlowConnection);
      
      if (status.isOnline && isOffline) {
        // Back online notification
        toast.success('Connection Restored', {
          description: 'Your internet connection has been restored.'
        });
      } else if (!status.isOnline) {
        // Offline notification
        toast.error('Connection Lost', {
          description: 'You appear to be offline. Please check your internet connection.'
        });
      }
    });
    
    // Set initial status
    const initialStatus = networkMonitor.getStatus();
    setIsOffline(!initialStatus.isOnline);
    setIsSlowConnection(initialStatus.isSlowConnection);
    
    return () => {
      cleanup();
      networkMonitor.destroy();
    };
  }, [isOffline]);

  // Real-time validation handlers
  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (touched.email) {
      const validation = validateEmail(value);
      setFormErrors(prev => ({
        ...prev,
        email: validation.isValid ? undefined : validation.error
      }));
    }
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    if (touched.password) {
      const validation = activeTab === 'signin' 
        ? validateLoginPassword(value) 
        : validateRegistrationPassword(value);
      setFormErrors(prev => ({
        ...prev,
        password: validation.isValid ? undefined : validation.error
      }));
    }
    
    // Also validate confirm password if it's filled
    if (confirmPassword && touched.confirmPassword) {
      const confirmValidation = validatePasswordConfirmation(value, confirmPassword);
      setFormErrors(prev => ({
        ...prev,
        confirmPassword: confirmValidation.isValid ? undefined : confirmValidation.error
      }));
    }
  };

  const handleConfirmPasswordChange = (value: string) => {
    setConfirmPassword(value);
    if (touched.confirmPassword) {
      const validation = validatePasswordConfirmation(password, value);
      setFormErrors(prev => ({
        ...prev,
        confirmPassword: validation.isValid ? undefined : validation.error
      }));
    }
  };

  const handleFullNameChange = (value: string) => {
    setFullName(value);
    if (touched.fullName) {
      const validation = validateFullName(value);
      setFormErrors(prev => ({
        ...prev,
        fullName: validation.isValid ? undefined : validation.error
      }));
    }
  };

  const handleBusinessNameChange = (value: string) => {
    setBusinessName(value);
    if (touched.businessName) {
      const validation = validateBusinessName(value, false); // Use quick validation for real-time
      setFormErrors(prev => ({
        ...prev,
        businessName: validation.isValid ? undefined : validation.error
      }));
      
      // Generate suggestions if name is valid but could be improved
      if (validation.isValid && value.trim().length > 2) {
        const suggestions = suggestBusinessNameImprovements(value);
        setBusinessNameSuggestions(suggestions);
      } else {
        setBusinessNameSuggestions([]);
      }
    }
  };

  const markFieldTouched = (fieldName: string) => {
    setTouched(prev => ({ ...prev, [fieldName]: true }));
  };

  const clearValidationErrors = () => {
    setFormErrors({});
    setTouched({});
  };

  // Tab change handler to clear validation
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    clearValidationErrors();
    // Clear form fields when switching tabs
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setFullName('');
    setBusinessName('');
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    logger.info('Starting sign up process...');

    try {
      // Validate entire form
      const errors = validateRegistrationForm(email, password, confirmPassword, fullName, businessName);
      
      if (hasValidationErrors(errors)) {
        setFormErrors(errors);
        setTouched({
          email: true,
          password: true,
          confirmPassword: true,
          fullName: true,
          businessName: true
        });
        
        const firstError = Object.values(errors)[0];
        toast.error('Please fix the form errors', {
          description: firstError
        });
        return;
      }

      logger.info('Attempting to sign up with email:', email);

      const { data, error } = await withNetworkAwareAuth(async () => {
        const result = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              business_name: businessName
            }
          }
        });
        
        logger.info('Sign up response:', result);
        
        if (result.error) {
          if (result.error.message.includes('User already registered')) {
            throw new Error('This email is already registered. Please sign in instead or use a different email');
          }
          throw result.error;
        }
        
        return result;
      }, 'signup');

      if (data?.user) {
        toast.success("Success!", {
          description: "Please check your email to confirm your account."
        });
        
        setEmail('');
        setPassword('');
        setFullName('');
        setBusinessName('');
        setConfirmPassword('');
        setActiveTab('signin');
      } else {
        throw new Error('Failed to create account. Please try again.');
      }
    } catch (error: any) {
      logger.error('Sign up error:', error);
      logAuthError(error, 'Sign Up');
      
      const friendlyError = getSignUpErrorMessage(error);
      toast.error(friendlyError.title, {
        description: friendlyError.description
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Validate login form
      const errors = validateLoginForm(email, password);
      
      if (hasValidationErrors(errors)) {
        setFormErrors(errors);
        setTouched({ email: true, password: true });
        
        const firstError = Object.values(errors)[0];
        toast.error('Please fix the form errors', {
          description: firstError
        });
        return;
      }

      const result = await withNetworkAwareAuth(async () => {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
        return data;
      }, 'signin');

      navigate('/dashboard');
    } catch (error: any) {
      logAuthError(error, 'Sign In');
      
      const friendlyError = getSignInErrorMessage(error);
      toast.error(friendlyError.title, {
        description: friendlyError.description
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      if (password.length < 8) {
        throw new Error('Your password needs to be at least 8 characters long for better security');
      }

      const hasLower = /[a-z]/.test(password);
      const hasUpper = /[A-Z]/.test(password);
      const hasNumber = /[0-9]/.test(password);
      const hasSpecial = /[!@#$%^&*]/.test(password);

      if (!hasLower || !hasUpper || !hasNumber || !hasSpecial) {
        throw new Error('Please create a stronger password that includes:\n- At least one lowercase letter (a-z)\n- At least one uppercase letter (A-Z)\n- At least one number (0-9)\n- At least one special character (!@#$%^&*)');
      }
      
      if (password !== confirmPassword) {
        throw new Error('The passwords you entered don\'t match. Please try again');
      }
      
      const { error } = await supabase.auth.updateUser({ password });
      
      if (error) throw error;
      
      toast.success('Password updated successfully!', {
        description: 'Redirecting to sign in page...'
      });
      
      logger.info('Password reset completed successfully - signing out user for security');
      
      // Clean sign out - this is the secure and standard approach
      await supabase.auth.signOut();
      
      // Clear all localStorage to ensure clean state
      localStorage.removeItem('pendingPasswordReset');
      
      // Clear form fields
      setPassword('');
      setConfirmPassword('');
      setIsResetMode(false);
      
      // Show brief informational message
      toast.info('Redirected to Sign In', {
        description: 'Please sign in with your new password.',
        duration: 3000
      });
      
      // Navigate to auth page for fresh sign in - no delay needed
      navigate('/auth', { replace: true });
    } catch (error: any) {
      logger.error('Error updating password:', error);
      logAuthError(error, 'Password Update');
      
      const friendlyError = getPasswordResetErrorMessage(error);
      toast.error(friendlyError.title, {
        description: friendlyError.description
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Validate email before sending reset
      const emailValidation = validateEmail(email);
      if (!emailValidation.isValid) {
        toast.error('Invalid Email', {
          description: emailValidation.error
        });
        return;
      }

      await withNetworkAwareAuth(async () => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/reset-password`
        });
        if (error) throw error;
        return {};
      }, 'reset');
      toast.success("Success!", {
        description: "Check your email for the password reset link."
      });
      setShowResetPassword(false);
    } catch (error: any) {
      logAuthError(error, 'Password Reset');
      
      const friendlyError = getPasswordResetErrorMessage(error);
      toast.error(friendlyError.title, {
        description: friendlyError.description
      });
    } finally {
      setLoading(false);
    }
  };

  const getTabContent = (tab) => {
    if (tab === 'signin') {
      return {
        title: t('auth.welcomeTitle'),
        description: t('auth.welcomeDescription')
      };
    } else {
      return {
        title: t('auth.getStartedTitle'),
        description: t('auth.getStartedDescription')
      };
    }
  };

  const { title, description } = getTabContent(activeTab);

  if (isResetMode) {
    // Show loading while validating session
    if (authLoading) {
      return (
        <div className="h-screen flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-500" />
            <p className="mt-2 text-gray-600">{t('auth.validatingSession')}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="h-screen flex items-center justify-center px-4 bg-gradient-to-br from-blue-50 to-blue-200 overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-50 via-transparent to-blue-200"></div>
        <div className="absolute inset-0 bg-[conic-gradient(from_0deg_at_50%_50%,_var(--tw-gradient-stops))] from-transparent via-blue-50 to-transparent"></div>
        <Card className="w-full max-w-md shadow-2xl border-1 backdrop-blur-sm bg-white relative z-10">
          <CardHeader className="text-center pb-4">
            <div className="flex items-center justify-center mb-2">
              <img src="https://okoaoguvtjauiecfajri.supabase.co/storage/v1/object/public/logo-and-icon/convgo-icon-auth-page.png" alt="ConvGo icon" className="h-14 w-auto" />
            </div>
            <CardTitle className="font-semibold">{t('auth.setNewPasswordTitle')}</CardTitle>
            <CardDescription className="text-sm">{t('auth.setNewPasswordDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordUpdate} className="space-y-4">
              <div>
                <Label htmlFor="new-password" className="text-left block py-1">{t('auth.newPassword')}</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder={t('auth.newPasswordPlaceholder')}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="confirm-password" className="text-left block py-1">{t('auth.confirmPassword')}</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder={t('auth.confirmPasswordPlaceholder')}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('auth.updatingPassword')}
                  </>
                ) : t('auth.updatePassword')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showResetPassword) {
    return <div className="h-screen flex items-center justify-center px-4 bg-gradient-to-br from-blue-50 to-blue-200 overflow-hidden relative">
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-50 via-transparent to-blue-200"></div>
    <div className="absolute inset-0 bg-[conic-gradient(from_0deg_at_50%_50%,_var(--tw-gradient-stops))] from-transparent via-blue-50 to-transparent"></div>
        <Card className="w-full max-w-md shadow-2xl border-1 backdrop-blur-sm bg-white relative z-10">
          <CardHeader className="text-center pb-4">
            <div className="flex items-center justify-center mb-2">
              <img src="https://okoaoguvtjauiecfajri.supabase.co/storage/v1/object/public/logo-and-icon/convgo-icon-auth-page.png" alt="ConvGo Logo" className="h-14 w-auto" />
            </div>
            <CardTitle className="font-semibold">{t('auth.resetPasswordTitle')}</CardTitle>
            <CardDescription>{t('auth.resetPasswordDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <Label htmlFor="reset-email" className="text-left block py-1">{t('auth.email')}</Label>
                <Input id="reset-email" type="email" placeholder={t('auth.emailPlaceholder')} value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="flex gap-4">
                <Button type="submit" disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-700">
                  {loading ? t('auth.sending') : t('auth.sendResetLink')}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowResetPassword(false)} className="flex-1">
                  {t('auth.backToLogin')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>;
  }

  return <div className="h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-50 via-blue-50 to-blue-200 overflow-hidden relative">
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-100/20 via-transparent to-blue-100/20"></div>
    <div className="absolute inset-0 bg-[conic-gradient(from_0deg_at_50%_50%,_var(--tw-gradient-stops))] from-transparent via-blue-100/10 to-transparent"></div>
      <Card className="w-full max-w-md shadow-2xl border-1 backdrop-blur-sm bg-white relative z-10">
        <CardHeader className="text-center pb-4">
          <div className="flex items-center justify-center mb-3">
            <img src="https://okoaoguvtjauiecfajri.supabase.co/storage/v1/object/public/logo-and-icon/convgo-icon-auth-page.png" alt="ConvGo Logo" className="h-14 w-auto" />
          </div>
          <CardTitle className="text-xl font-semibold text-center mb-2">{title}</CardTitle>
          <CardDescription className="text-sm text-gray-600">{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Network Status Indicator */}
          {(isOffline || isSlowConnection) && (
            <div className={`mb-4 p-3 rounded-lg border flex items-center gap-2 text-sm ${
              isOffline 
                ? 'bg-red-50 border-red-200 text-red-800' 
                : 'bg-yellow-50 border-yellow-200 text-yellow-800'
            }`}>
              {isOffline ? (
                <>
                  <WifiOff className="h-4 w-4" />
                  <span>{t('auth.offlineMessage')}</span>
                </>
              ) : (
                <>
                  <Signal className="h-4 w-4" />
                  <span>{t('auth.slowConnectionMessage')}</span>
                </>
              )}
            </div>
          )}
          
          <Tabs value={activeTab} className="w-full" onValueChange={handleTabChange}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">{t('auth.signIn')}</TabsTrigger>
              <TabsTrigger value="signup">{t('auth.signUp')}</TabsTrigger>
            </TabsList>
            
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-3">
                <div>
                  <Label htmlFor="signin-email" className="text-left block py-1">{t('auth.email')}</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    placeholder={t('auth.emailPlaceholder')}
                    value={email}
                    onChange={e => handleEmailChange(e.target.value)}
                    onBlur={() => markFieldTouched('email')}
                    className={formErrors.email ? 'border-red-500 focus:border-red-500' : ''}
                    required
                  />
                  {formErrors.email && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="signin-password" className="text-left block py-1">{t('auth.password')}</Label>
                  <Input
                    id="signin-password"
                    type="password"
                    placeholder={t('auth.passwordPlaceholder')}
                    value={password}
                    onChange={e => handlePasswordChange(e.target.value)}
                    onBlur={() => markFieldTouched('password')}
                    className={formErrors.password ? 'border-red-500 focus:border-red-500' : ''}
                    required
                  />
                  {formErrors.password && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.password}</p>
                  )}
                </div>
                <p
                  onClick={() => setShowResetPassword(true)}
                  className="text-sm font-normal text-black hover:text-blue-600 cursor-pointer transition-colors duration-200"
                >
                  {t('auth.forgotPassword')}
                </p>
                <Button 
                  type="submit" 
                  disabled={loading || isOffline} 
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isSlowConnection ? t('auth.signingInSlow') : t('auth.signingIn')}
                    </>
                  ) : isOffline ? (
                    <>
                      <WifiOff className="mr-2 h-4 w-4" />
                      {t('auth.offline')}
                    </>
                  ) : (
                    t('auth.signIn')
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-2">
                <div>
                  <Label htmlFor="fullName" className="text-left block py-1">{t('auth.fullName')}</Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder={t('auth.fullNamePlaceholder')}
                    value={fullName}
                    onChange={e => handleFullNameChange(e.target.value)}
                    onBlur={() => markFieldTouched('fullName')}
                    className={formErrors.fullName ? 'border-red-500 focus:border-red-500' : ''}
                    required
                  />
                  {formErrors.fullName && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.fullName}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="signup-email" className="text-left block py-1">{t('auth.email')}</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder={t('auth.emailPlaceholder')}
                    value={email}
                    onChange={e => handleEmailChange(e.target.value)}
                    onBlur={() => markFieldTouched('email')}
                    className={formErrors.email ? 'border-red-500 focus:border-red-500' : ''}
                    required
                  />
                  {formErrors.email && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="businessName" className="text-left block py-1">{t('auth.businessName')}</Label>
                  <Input
                    id="businessName"
                    type="text"
                    placeholder={t('auth.businessNamePlaceholder')}
                    value={businessName}
                    onChange={e => handleBusinessNameChange(e.target.value)}
                    onBlur={() => markFieldTouched('businessName')}
                    className={formErrors.businessName ? 'border-red-500 focus:border-red-500' : ''}
                    required
                  />
                  {formErrors.businessName && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.businessName}</p>
                  )}
                  {!formErrors.businessName && businessNameSuggestions.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-slate-600 mb-2">{t('auth.suggestions')}</p>
                      <div className="flex flex-wrap gap-1">
                        {businessNameSuggestions.map((suggestion, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => {
                              handleBusinessNameChange(suggestion);
                              setBusinessName(suggestion);
                              setBusinessNameSuggestions([]);
                            }}
                            className="px-2 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200 transition-colors"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <PasswordInput
                    id="signup-password"
                    label="Password"
                    value={password}
                    onChange={handlePasswordChange}
                    onBlur={() => markFieldTouched('password')}
                    required
                  />
                  {formErrors.password && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.password}</p>
                  )}
                </div>
                <div>
                  <PasswordInput
                    id="confirm-password"
                    label="Confirm Password"
                    value={confirmPassword}
                    onChange={handleConfirmPasswordChange}
                    onBlur={() => markFieldTouched('confirmPassword')}
                    isConfirm
                    originalPassword={password}
                    required
                  />
                  {formErrors.confirmPassword && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.confirmPassword}</p>
                  )}
                </div>
                <Button 
                  type="submit" 
                  disabled={loading || isOffline} 
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isSlowConnection ? t('auth.signingUpSlow') : t('auth.signingUp')}
                    </>
                  ) : isOffline ? (
                    <>
                      <WifiOff className="mr-2 h-4 w-4" />
                      {t('auth.offline')}
                    </>
                  ) : (
                    t('auth.signUp')
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
          <AuthDivider />
          <GoogleSignInButton disabled={loading} />
          <TermsAndPrivacy />
        </CardContent>
      </Card>
    </div>;
}
