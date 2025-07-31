
import { useAuth } from "@/contexts/AuthContext";
import { MetadataFieldsManager } from "@/components/MetadataFieldsManager";
import { motion } from "framer-motion";

export default function MetadataManagement() {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p>Please sign in to manage metadata fields.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="container mx-auto px-4 py-8 max-w-4xl"
    >
      <motion.h1
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2 }}
        className="text-2xl font-bold mb-8"
      >
        Metadata Management
      </motion.h1>

      <MetadataFieldsManager />
    </motion.div>
  );
}
