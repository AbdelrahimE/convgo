
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { FileUploader } from "@/components/FileUploader";
import { FileList } from "@/components/FileList";
import { motion } from "framer-motion";
import { useEffect } from "react";

export default function FileManagement() {
  const { user } = useAuth();
  const isMobile = useIsMobile();

  useEffect(() => {
    console.log('FileManagement mounted, current user:', user);
  }, [user]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="container mx-auto px-4 py-8 max-w-7xl"
    >
      <div className="space-y-8">
        <motion.h1 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="text-2xl font-bold text-left md:text-3xl lg:text-4xl"
        >
          File Management
        </motion.h1>
        <div className="grid gap-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <FileUploader />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <FileList />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
