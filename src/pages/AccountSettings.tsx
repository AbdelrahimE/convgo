import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { Loader2, Building } from 'lucide-react';
import { motion } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';
import logger from '@/utils/logger';

export default function AccountSettings() {
  const {
    user
  } = useAuth();
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name || '');
  const [businessName, setBusinessName] = useState(user?.user_metadata?.business_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.user_metadata?.phone || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.user_metadata?.avatar_url || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPasswordResetSent, setIsPasswordResetSent] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (user) {
      setFullName(user.user_metadata?.full_name || '');
      setBusinessName(user.user_metadata?.business_name || '');
      setEmail(user.email || '');
      setPhoneNumber(user.user_metadata?.phone || '');
      setAvatarUrl(user.user_metadata?.avatar_url || '');
      if (!user.user_metadata?.business_name) {
        fetchBusinessNameFromProfile();
      }
    }
  }, [user]);

  const fetchBusinessNameFromProfile = async () => {
    if (!user) return;
    try {
      const {
        data,
        error
      } = await supabase.from('profiles').select('business_name').eq('id', user.id).single();
      if (error) {
        logger.error('Error fetching business name:', error);
        return;
      }
      if (data && data.business_name) {
        setBusinessName(data.business_name);
      }
    } catch (error) {
      logger.error('Error fetching business name:', error);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 2 * 1024 * 1024) {
        toast.error('Image size should not exceed 2MB');
        return;
      }
      setAvatarFile(file);
      setAvatarUrl(URL.createObjectURL(file));
    }
  };

  const deleteOldAvatar = async (oldAvatarUrl: string): Promise<boolean> => {
    if (!oldAvatarUrl || !oldAvatarUrl.includes('avatars/')) return true;
    try {
      const urlParts = oldAvatarUrl.split('/');
      const fileName = urlParts[urlParts.length - 1];
      if (!fileName) return true;
      const {
        error
      } = await supabase.storage.from('avatars').remove([fileName]);
      if (error) {
        logger.error('Error deleting old avatar:', error);
        return false;
      }
      return true;
    } catch (error) {
      logger.error('Error in deleteOldAvatar:', error);
      return false;
    }
  };

  const uploadAvatar = async (): Promise<string | null> => {
    if (!avatarFile || !user) return avatarUrl;
    try {
      const fileExt = avatarFile.name.split('.').pop();
      const fileName = `${user.id}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${fileName}`;
      const {
        error: uploadError
      } = await supabase.storage.from('avatars').upload(filePath, avatarFile);
      if (uploadError) {
        toast.error('Avatar upload failed');
        logger.error('Error uploading avatar:', uploadError);
        return null;
      }
      const {
        data
      } = supabase.storage.from('avatars').getPublicUrl(filePath);
      return data.publicUrl;
    } catch (error) {
      logger.error('Error uploading avatar:', error);
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      let newAvatarUrl = avatarUrl;
      if (avatarFile) {
        if (user?.user_metadata?.avatar_url) {
          await deleteOldAvatar(user.user_metadata.avatar_url);
        }
        const uploadedUrl = await uploadAvatar();
        if (uploadedUrl) {
          newAvatarUrl = uploadedUrl;
        }
      }
      const {
        error: authUpdateError
      } = await supabase.auth.updateUser({
        data: {
          full_name: fullName,
          business_name: businessName,
          phone: phoneNumber,
          avatar_url: newAvatarUrl
        }
      });
      if (authUpdateError) {
        throw authUpdateError;
      }
      const {
        error: profileUpdateError
      } = await supabase.from('profiles').update({
        full_name: fullName,
        business_name: businessName,
        updated_at: new Date().toISOString()
      }).eq('id', user!.id);
      if (profileUpdateError) {
        throw profileUpdateError;
      }
      toast.success('Profile updated successfully');
    } catch (error: any) {
      toast.error(`Error updating profile: ${error.message}`);
      logger.error('Error updating profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    try {
      setIsLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?reset=true`
      });
      if (error) {
        throw error;
      }
      setIsPasswordResetSent(true);
      toast.success('Password reset email sent');
    } catch (error: any) {
      toast.error(`Failed to send password reset email: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(part => part[0]).join('').toUpperCase().slice(0, 2);
  };

  if (!user) {
    return <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>;
  }

  return <motion.div initial={{
    opacity: 0,
    y: 20
  }} animate={{
    opacity: 1,
    y: 0
  }} transition={{
    duration: 0.3
  }} className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="space-y-8">
        <motion.h1 initial={{
        opacity: 0,
        x: -20
      }} animate={{
        opacity: 1,
        x: 0
      }} transition={{
        delay: 0.2
      }} className="text-2xl text-left md:text-3xl font-extrabold lg:text-4xl">
          Account Settings
        </motion.h1>
        
        <div className="grid gap-8">
          <motion.div initial={{
          opacity: 0,
          y: 20
        }} animate={{
          opacity: 1,
          y: 0
        }} transition={{
          delay: 0.3
        }}>
            <Card className="w-full">
              <CardHeader>
                <CardTitle className="font-bold text-left">Profile Information</CardTitle>
                <CardDescription>Update your account profile details</CardDescription>
              </CardHeader>
              <form onSubmit={handleSubmit}>
                <CardContent className="space-y-4">
                  <div className="flex flex-col items-center space-y-4 mb-6">
                    <Avatar className="h-24 w-24">
                      <AvatarImage src={avatarUrl} alt={fullName} />
                      <AvatarFallback>{fullName ? getInitials(fullName) : 'U'}</AvatarFallback>
                    </Avatar>
                    <div>
                      <Label htmlFor="avatar" className="cursor-pointer text-primary-foreground px-4 py-2 rounded-md bg-blue-700">
                        Change Avatar
                      </Label>
                      <Input id="avatar" type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input id="fullName" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Enter your full name" />
                  </div>

                  <div>
                    <Label htmlFor="businessName">Business Name</Label>
                    <div className="flex items-center relative">
                      <Building className="absolute left-3 h-4 w-4 text-muted-foreground" />
                      <Input id="businessName" value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Enter your business name" className="pl-10" />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} disabled className="bg-muted/50" />
                    <p className="text-xs text-muted-foreground mt-1">
                      Email address cannot be changed
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="phoneNumber">Phone Number (include country code)</Label>
                    <Input id="phoneNumber" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="Enter your phone number" />
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
                    {isLoading ? <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </> : 'Save Changes'}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </motion.div>
          
          <motion.div initial={{
          opacity: 0,
          y: 20
        }} animate={{
          opacity: 1,
          y: 0
        }} transition={{
          delay: 0.4
        }}>
            <Card className="w-full">
              <CardHeader>
                <CardTitle className="text-left font-bold">Password</CardTitle>
                <CardDescription>Update your password securely</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isPasswordResetSent ? <p className="text-sm text-muted-foreground">
                    Password reset email has been sent to your email address.
                    Please check your inbox and follow the instructions.
                  </p> : <p className="text-sm text-muted-foreground">A password reset link will be sent to your email for security purposes.</p>}
              </CardContent>
              <CardFooter>
                <Button variant="outline" onClick={handlePasswordReset} disabled={isLoading || isPasswordResetSent}>
                  {isLoading ? <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </> : 'Send Password Reset Email'}
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        </div>
      </div>
    </motion.div>;
}
