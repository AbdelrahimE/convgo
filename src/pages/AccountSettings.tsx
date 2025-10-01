import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PasswordInput } from '@/components/PasswordInput';
import { toast } from 'sonner';
import { Loader2, Building, User, Shield, Mail } from 'lucide-react';
import logger from '@/utils/logger';
import { useTranslation } from 'react-i18next';

export default function AccountSettings() {
  const {
    user
  } = useAuth();
  const { t } = useTranslation();
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name || '');
  const [businessName, setBusinessName] = useState(user?.user_metadata?.business_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.user_metadata?.phone || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.user_metadata?.avatar_url || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Password change states
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Email change states
  const [newEmail, setNewEmail] = useState('');
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);
  const [emailUpdateSent, setEmailUpdateSent] = useState(false);

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
        toast.error(t('accountSettings.imageSizeError'));
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
        toast.error(t('accountSettings.avatarUploadFailed'));
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
      toast.success(t('accountSettings.profileUpdatedSuccess'));
    } catch (error: any) {
      toast.error(`${t('accountSettings.errorUpdatingProfile')}: ${error.message}`);
      logger.error('Error updating profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Email validation function
  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Handle email change
  const handleEmailChange = async () => {
    // Validation
    if (!newEmail.trim()) {
      toast.error(t('accountSettings.pleaseEnterNewEmail'));
      return;
    }

    if (!isValidEmail(newEmail)) {
      toast.error(t('accountSettings.pleaseEnterValidEmail'));
      return;
    }

    if (newEmail === user!.email) {
      toast.error(t('accountSettings.thisIsCurrentEmail'));
      return;
    }

    try {
      setIsUpdatingEmail(true);
      
      // Update email - Supabase will send confirmation email
      const { error } = await supabase.auth.updateUser({
        email: newEmail
      });
      
      if (error) {
        if (error.message.includes('email_address_already_in_use')) {
          toast.error(t('accountSettings.emailAlreadyInUse'));
        } else {
          throw error;
        }
        return;
      }

      // Success
      setEmailUpdateSent(true);
      toast.success(t('accountSettings.confirmationEmailSent'));
      toast.info(t('accountSettings.checkEmailConfirmation'));

    } catch (error: any) {
      logger.error('Error updating email:', error);
      toast.error(`${t('accountSettings.errorUpdatingEmail')}: ${error.message}`);
    } finally {
      setIsUpdatingEmail(false);
    }
  };

  const handlePasswordChange = async () => {
    // Validation
    if (!newPassword.trim()) {
      toast.error(t('accountSettings.pleaseEnterNewPassword'));
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error(t('accountSettings.passwordsDoNotMatch'));
      return;
    }

    try {
      setIsChangingPassword(true);
      
      // Update password directly - active session provides sufficient authentication
      const { error: updateError } = await supabase.auth.updateUser({ 
        password: newPassword 
      });
      
      if (updateError) {
        throw updateError;
      }
      
      // Clear form
      setNewPassword('');
      setConfirmPassword('');

      toast.success(t('accountSettings.passwordChangedSuccess'));

    } catch (error: any) {
      logger.error('Error changing password:', error);
      toast.error(`${t('accountSettings.errorChangingPassword')}: ${error.message}`);
    } finally {
      setIsChangingPassword(false);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(part => part[0]).join('').toUpperCase().slice(0, 2);
  };

  if (!user) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white dark:bg-slate-900">
        <div className="flex flex-col items-center space-y-4">
          <div className="relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-20 w-20 rounded-full border-4 border-blue-100 dark:border-blue-900"></div>
            </div>
            <div className="relative flex items-center justify-center">
              <div className="h-20 w-20 animate-spin rounded-full border-4 border-transparent border-t-blue-600 dark:border-t-blue-400"></div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <User className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <div className="text-center space-y-2">
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t('accountSettings.loadingAccountSettings')}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('accountSettings.pleaseWait')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-white dark:bg-slate-900">
      {/* Header Section */}
      <div className="bg-white dark:bg-slate-900">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div>
                <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-slate-100">
                  {t('accountSettings.title')}
                </h1>
                <p className="text-sm md:text-base text-slate-600 dark:text-slate-400 mt-1">
                  {t('accountSettings.description')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-6">
        {/* Profile Information Card */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="p-4">
            <div className="mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <User className="h-5 w-5" />
                {t('accountSettings.profileInfo')}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t('accountSettings.profileInfoDescription')}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Two-Column Layout: Avatar Left, Form Fields Right */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Section - Avatar */}
                <div className="lg:col-span-1 flex flex-col items-center justify-center space-y-4">
                  <Avatar className="h-32 w-32">
                    <AvatarImage src={avatarUrl} alt={fullName} />
                    <AvatarFallback className="text-xl font-semibold">
                      {fullName ? getInitials(fullName) : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <Label 
                      htmlFor="avatar" 
                      className="cursor-pointer inline-flex items-center px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
                    >
                      {t('accountSettings.changeAvatar')}
                    </Label>
                    <Input
                      id="avatar"
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="hidden"
                    />
                  </div>
                </div>

                {/* Right Section - Form Fields (Vertical Layout) */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="space-y-0">
                    <Label htmlFor="fullName">{t('accountSettings.fullName')}</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder={t('accountSettings.fullNamePlaceholder')}
                      className="w-full text-sm"
                    />
                  </div>

                  <div className="space-y-0">
                    <Label htmlFor="businessName">{t('accountSettings.businessName')}</Label>
                    <div className="relative">
                      <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <Input
                        id="businessName"
                        value={businessName}
                        onChange={e => setBusinessName(e.target.value)}
                        placeholder={t('accountSettings.businessNamePlaceholder')}
                        className="pl-10 w-full text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-0">
                    <Label htmlFor="phoneNumber">{t('accountSettings.phoneNumber')}</Label>
                    <Input
                      id="phoneNumber"
                      value={phoneNumber}
                      onChange={e => setPhoneNumber(e.target.value)}
                      placeholder={t('accountSettings.phoneNumberPlaceholder')}
                      className="w-full text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end">
                <Button 
                  type="submit" 
                  disabled={isLoading} 
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('accountSettings.saving')}
                    </>
                  ) : (
                    t('accountSettings.saveChanges')
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>

        {/* Email Settings Card */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="p-4">
            <div className="mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Mail className="h-5 w-5" />
                {t('accountSettings.emailSettings')}
              </h2>
            </div>

            <div className="space-y-4">
              {/* Current Email Display */}
              <div className="space-y-0">
                <Label>{t('accountSettings.currentEmail')}</Label>
                <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-600 dark:text-slate-400 text-sm">
                  {user?.email}
                </div>
              </div>

              {emailUpdateSent ? (
                /* Success State */
                <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <div className="flex items-center justify-center w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full">
                        <Mail className="w-4 h-4 text-green-600 dark:text-green-400" />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-green-800 dark:text-green-200">
                        {t('accountSettings.emailConfirmationSent')}
                      </h3>
                      <div className="mt-2 text-sm text-green-700 dark:text-green-300">
                        <p>{t('accountSettings.emailConfirmationDescription')} <strong>{newEmail}</strong></p>
                        <p className="mt-1">{t('accountSettings.emailConfirmationInstructions')}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Email Change Form */
                <>
                  <div className="space-y-0">
                    <Label htmlFor="newEmail">{t('accountSettings.newEmail')}</Label>
                    <Input
                      id="newEmail"
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder={t('accountSettings.newEmailPlaceholder')}
                      className="w-full text-sm"
                    />
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      <strong>{t('accountSettings.emailNote')}</strong> {t('accountSettings.emailNoteDescription')}
                    </p>
                  </div>

                  {/* Update Email Button */}
                  <div className="flex justify-end">
                    <Button
                      onClick={handleEmailChange}
                      disabled={isUpdatingEmail || !newEmail.trim()}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {isUpdatingEmail ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t('accountSettings.updatingEmail')}
                        </>
                      ) : (
                        t('accountSettings.updateEmail')
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        
        {/* Password Security Card */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="p-4">
            <div className="mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Shield className="h-5 w-5" />
                {t('accountSettings.changePassword')}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                {t('accountSettings.changePasswordDescription')}
              </p>
            </div>

            <div className="space-y-4">
              {/* New Password */}
              <PasswordInput
                id="newPassword"
                label={t('accountSettings.newPassword')}
                value={newPassword}
                onChange={setNewPassword}
                required
              />

              {/* Confirm Password */}
              <PasswordInput
                id="confirmPassword"
                label={t('accountSettings.confirmNewPassword')}
                value={confirmPassword}
                onChange={setConfirmPassword}
                isConfirm={true}
                originalPassword={newPassword}
                required
              />

              {/* Change Password Button */}
              <div className="flex justify-end">
                <Button 
                  onClick={handlePasswordChange} 
                  disabled={isChangingPassword || !newPassword || !confirmPassword}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isChangingPassword ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('accountSettings.changingPassword')}
                    </>
                  ) : (
                    t('accountSettings.changePasswordButton')
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
