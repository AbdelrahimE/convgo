import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { LogoWithText } from '@/components/Logo';
import { Loader2 } from 'lucide-react';
import logger from '@/utils/logger';

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [activeTab, setActiveTab] = useState('signin');
  const [isResetMode, setIsResetMode] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('reset') === 'true') {
      setIsResetMode(true);
    }
  }, [location]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    logger.info('Starting sign up process...');

    try {
      if (fullName.length < 3) {
        throw new Error('Full name must be at least 3 characters long');
      }
      
      if (password.length < 8) {
        throw new Error('Your password needs to be at least 8 characters long for better security');
      }

      if (password !== confirmPassword) {
        throw new Error('Passwords do not match. Please try again.');
      }

      const hasLower = /[a-z]/.test(password);
      const hasUpper = /[A-Z]/.test(password);
      const hasNumber = /[0-9]/.test(password);
      const hasSpecial = /[!@#$%^&*]/.test(password);

      if (!hasLower || !hasUpper || !hasNumber || !hasSpecial) {
        throw new Error('Please create a stronger password that includes:\n- At least one lowercase letter (a-z)\n- At least one uppercase letter (A-Z)\n- At least one number (0-9)\n- At least one special character (!@#$%^&*)');
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new Error('Please enter a valid email address (example: name@domain.com)');
      }

      logger.info('Attempting to sign up with email:', email);

      const {
        data,
        error: signUpError
      } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            business_name: businessName
          }
        }
      });

      logger.info('Sign up response:', { data, error: signUpError });

      if (signUpError) {
        if (signUpError.message.includes('User already registered')) {
          throw new Error('This email is already registered. Please sign in instead or use a different email');
        }
        throw signUpError;
      }

      if (data?.user) {
        toast.success("Success!", {
          description: "Please check your email to confirm your account."
        });
        setEmail('');
        setPassword('');
        setFullName('');
        setBusinessName('');
      } else {
        throw new Error('Failed to create account. Please try again.');
      }
    } catch (error: any) {
      logger.error('Sign up error:', error);
      toast.error("Error", {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const {
        error: signInError
      } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (signInError) throw signInError;
      navigate('/whatsapp');
    } catch (error: any) {
      toast.error("Error", {
        description: error.message
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
      
      toast.success('Password updated successfully', {
        description: 'You can now sign in with your new password.'
      });
      
      setPassword('');
      setConfirmPassword('');
      setIsResetMode(false);
      setActiveTab('signin');
    } catch (error: any) {
      logger.error('Error updating password:', error);
      toast.error("Error", {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const {
        error
      } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`
      });
      if (error) throw error;
      toast.success("Success!", {
        description: "Check your email for the password reset link."
      });
      setShowResetPassword(false);
    } catch (error: any) {
      toast.error("Error", {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const getTabContent = (tab) => {
    if (tab === 'signin') {
      return {
        title: "Sign in to ConvGo",
        description: "Welcome back! Please sign in to continue"
      };
    } else {
      return {
        title: "Get Started with ConvGo",
        description: "Automate WhatsApp with AI — Join ConvGo now."
      };
    }
  };

  const { title, description } = getTabContent(activeTab);

  if (isResetMode) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-white/0">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <LogoWithText className="mb-4" />
            <CardTitle className="font-bold">Set New Password</CardTitle>
            <CardDescription>Enter your new password below</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordUpdate} className="space-y-4">
              <div>
                <Label htmlFor="new-password" className="text-left block py-[5px]">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Enter your new password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="confirm-password" className="text-left block py-[5px]">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Confirm your new password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-blue-700 hover:bg-blue-600">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating Password...
                  </>
                ) : 'Update Password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showResetPassword) {
    return <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-white/0">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <LogoWithText className="mb-4" />
            <CardTitle className="font-bold">Reset Your Password</CardTitle>
            <CardDescription>Enter your email to receive a password reset link</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <Label htmlFor="reset-email" className="text-left block py-[5px]">Email</Label>
                <Input id="reset-email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="flex gap-4">
                <Button type="submit" disabled={loading} className="flex-1 bg-blue-700 hover:bg-blue-600">
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowResetPassword(false)} className="flex-1">
                  Back to Login
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>;
  }

  return <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-white/0">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <LogoWithText className="mb-4" />
          <CardTitle className="text-2xl font-bold text-center">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin" className="w-full" onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <Label htmlFor="signin-email" className="text-left block py-[5px]">Email</Label>
                  <Input id="signin-email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="signin-password" className="text-left block py-[5px]">Password</Label>
                  <Input id="signin-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                </div>
                <Button type="button" variant="link" onClick={() => setShowResetPassword(true)} className="px-0 justify-start w-auto h-auto text-left my-0 mx-0 py-0">
                  Can't access your account?
                </Button>
                <Button type="submit" disabled={loading} className="w-full bg-blue-700 hover:bg-blue-600">
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div>
                  <Label htmlFor="fullName" className="text-left block py-[5px]">Full Name</Label>
                  <Input 
                    id="fullName" 
                    type="text" 
                    placeholder="John Doe" 
                    value={fullName} 
                    onChange={e => setFullName(e.target.value)} 
                    required 
                  />
                </div>
                <div>
                  <Label htmlFor="signup-email" className="text-left block py-[5px]">Email</Label>
                  <Input 
                    id="signup-email" 
                    type="email" 
                    placeholder="you@example.com" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    required 
                  />
                </div>
                <div>
                  <Label htmlFor="businessName" className="text-left block py-[5px]">Business Name</Label>
                  <Input 
                    id="businessName" 
                    type="text" 
                    placeholder="Acme Inc" 
                    value={businessName} 
                    onChange={e => setBusinessName(e.target.value)} 
                    required 
                  />
                </div>
                <div>
                  <Label htmlFor="signup-password" className="text-left block py-[5px]">Password</Label>
                  <Input 
                    id="signup-password" 
                    type="password" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    required 
                  />
                </div>
                <div>
                  <Label htmlFor="confirm-password" className="text-left block py-[5px]">Confirm Password</Label>
                  <Input 
                    id="confirm-password" 
                    type="password" 
                    value={confirmPassword} 
                    onChange={e => setConfirmPassword(e.target.value)} 
                    required 
                  />
                </div>
                <Button type="submit" disabled={loading} className="w-full bg-blue-700 hover:bg-blue-600">
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing up...
                    </>
                  ) : 'Sign Up'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>;
}
