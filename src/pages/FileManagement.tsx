import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { FileUploader } from "@/components/FileUploader";
import { FileList } from "@/components/FileList";
import { motion } from "framer-motion";
import { useEffect } from "react";
import { Files, Upload, Filter, MoreHorizontal, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import logger from '@/utils/logger';

export default function FileManagement() {
  const {
    user
  } = useAuth();
  const isMobile = useIsMobile();
  
  useEffect(() => {
    logger.log('FileManagement mounted, current user:', user);
  }, [user]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.3 }}
      className="w-full min-h-screen bg-white dark:bg-slate-900"
    >
      {/* Header Section */}
      <div className="bg-white dark:bg-slate-900">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <motion.div 
              initial={{ opacity: 0, x: -20 }} 
              animate={{ opacity: 1, x: 0 }} 
              transition={{ delay: 0.1 }}
              className="flex items-center space-x-3"
            >
              <div>
                <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-slate-100">
                  File Management
                </h1>
                <p className="text-sm md:text-base text-slate-600 dark:text-slate-400 mt-1">
                  Upload, process, and manage your documents with AI-powered text analysis
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-6">
        
        {/* Upload Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.3 }}
          className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm"
        >
          <div className="p-4">
            <div className="flex items-center space-x-2 mb-4">
              <Upload className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">
                Upload Documents
              </h2>
            </div>
            <FileUploader />
          </div>
        </motion.div>

        {/* Files Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.4 }}
          className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm"
        >
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Files className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">
                  Your Documents
                </h2>
              </div>
              
              {/* Search and Filters */}
              <div className="flex items-center space-x-3">
                <div className="relative hidden sm:block">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    placeholder="Search files..." 
                    className="pl-10 w-64 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  />
                </div>
              </div>
            </div>
            
            <FileList />
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
