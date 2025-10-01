import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { FileUploader } from "@/components/FileUploader";
import { FileList } from "@/components/FileList";
import { useEffect, useState } from "react";
import { useTranslation } from 'react-i18next';
import { Files, Filter, MoreHorizontal, Search, FolderUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import logger from '@/utils/logger';

export default function FileManagement() {
  const {
    user,
    loading: authLoading
  } = useAuth();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [searchTerm, setSearchTerm] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  
  useEffect(() => {
    logger.log('FileManagement mounted, current user:', user);
    // Simulate initial loading for smooth transition
    const timer = setTimeout(() => {
      setInitialLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [user]);

  // Modern loading state similar to WhatsApp Instances
  if (authLoading || initialLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white dark:bg-slate-900">
        <div className="flex flex-col items-center space-y-4">
          {/* Modern animated loader with gradient */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-20 w-20 rounded-full border-4 border-blue-100 dark:border-blue-900"></div>
            </div>
            <div className="relative flex items-center justify-center">
              <div className="h-20 w-20 animate-spin rounded-full border-4 border-transparent border-t-blue-600 dark:border-t-blue-400"></div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Files className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          
          {/* Loading text with animation */}
          <div className="loading-text-center space-y-2">
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t('fileManagement.loadingTitle')}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('fileManagement.loadingDescription')}
            </p>
          </div>
          
          {/* Loading dots animation */}
          <div className="flex space-x-1">
            <div className="h-2 w-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="h-2 w-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="h-2 w-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
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
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100">
                  {t('fileManagement.title')}
                </h1>
                <p className="text-sm md:text-base text-slate-600 dark:text-slate-400 mt-1">
                  {t('fileManagement.description')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-6">
        
        {/* Upload Section */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="p-4">
            <div className="flex items-center space-x-2 mb-4">
              <FolderUp className="w-5 h-5 text-slate-900 dark:text-slate-100" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {t('fileManagement.uploadDocuments')}
              </h2>
            </div>
            <FileUploader />
          </div>
        </div>

        {/* Files Section */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Files className="w-5 h-5 text-slate-900 dark:text-slate-100" />
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {t('fileManagement.yourDocuments')}
                </h2>
              </div>
              
              {/* Search and Filters */}
              <div className="flex items-center space-x-3">
                <div className="relative hidden sm:block">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder={t('fileManagement.searchFiles')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-64 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  />
                </div>
              </div>
            </div>
            
            <FileList searchTerm={searchTerm} />
          </div>
        </div>
      </div>
    </div>
  );
}
