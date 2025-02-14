import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search } from 'lucide-react';
import { countryCodes } from '@/data/countryCodes';
export default function Auth() {
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('US+1');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const countryCode = selectedCountry.split('+')[1];
  const filteredCountries = countryCodes.filter(country => country.name.toLowerCase().includes(searchQuery.toLowerCase()) || country.code.includes(searchQuery));
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (fullName.length < 3) {
        throw new Error('Full name must be at least 3 characters long');
      }
      const {
        error: signUpError
      } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            business_name: businessName,
            phone: `+${countryCode}${phoneNumber}`
          }
        }
      });
      if (signUpError) throw signUpError;
      toast({
        title: "Success!",
        description: "Please check your email to confirm your account."
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
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
      navigate('/dashboard');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
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
      toast({
        title: "Success!",
        description: "Check your email for the password reset link."
      });
      setShowResetPassword(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };
  if (showResetPassword) {
    return <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-white/0">
        <Card className="w-full max-w-md">
          <CardHeader className="text-left">
            <CardTitle>Reset Your Password</CardTitle>
            <CardDescription>Enter your email to receive a password reset link</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <Label htmlFor="reset-email" className="text-left block py-[5px]">Email</Label>
                <Input id="reset-email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="flex gap-4">
                <Button type="submit" className="flex-1" disabled={loading}>
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
        <CardHeader className="text-left">
          <CardTitle>AI Support Assistant</CardTitle>
          <CardDescription>Sign in to your account or create a new one</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin" className="text-left">Sign In</TabsTrigger>
              <TabsTrigger value="signup" className="text-left">Sign Up</TabsTrigger>
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
                <Button type="button" variant="link" onClick={() => setShowResetPassword(true)} className="px-0 justify-start w-auto h-auto text-left my-0 mx-0 py-0">Can't access your account?</Button>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div>
                  <Label htmlFor="signup-email" className="text-left block py-[5px]">Email</Label>
                  <Input id="signup-email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <div className="relative">
                  <Label htmlFor="phone-number" className="text-left block py-[5px]">Phone Number</Label>
                  <div className="flex gap-2">
                    <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue>
                          {countryCodes.find(c => `${c.country}${c.code}` === selectedCountry)?.flag} +{countryCode}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px] overflow-y-auto">
                        <div className="sticky top-0 z-[51] bg-white border-b">
                          <div className="relative p-2">
                            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input placeholder="Search countries..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8" />
                          </div>
                        </div>
                        <div className="pt-1 pb-2">
                          {filteredCountries.map(country => <SelectItem key={`${country.country}${country.code}`} value={`${country.country}${country.code}`} className="flex items-center gap-2">
                              <span className="flex items-center gap-2">
                                <span>{country.flag}</span>
                                <span>{country.code}</span>
                                <span className="text-gray-500 text-sm">({country.name})</span>
                              </span>
                            </SelectItem>)}
                        </div>
                      </SelectContent>
                    </Select>
                    <Input id="phone-number" type="tel" placeholder="Enter phone number" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} required className="flex-1" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="signup-password" className="text-left block py-[5px]">Password</Label>
                  <Input id="signup-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="fullName" className="text-left block py-[5px]">Full Name</Label>
                  <Input id="fullName" type="text" placeholder="John Doe" value={fullName} onChange={e => setFullName(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="businessName" className="text-left block py-[5px]">Business Name</Label>
                  <Input id="businessName" type="text" placeholder="Acme Inc" value={businessName} onChange={e => setBusinessName(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Signing up...' : 'Sign Up'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>;
}