
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TextProcessingButton } from "@/components/TextProcessingButton";
import { motion } from "framer-motion";

interface FileProcessingToolsProps {
  fileId: string;
}

export default function FileProcessingTools({ fileId }: FileProcessingToolsProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("text-processing");
  const [textProcessed, setTextProcessed] = useState(false);

  if (!user || !fileId) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full"
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Document Processing Tools</CardTitle>
          <CardDescription>
            Process your document for AI-powered insights and responses
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="text-processing" onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="text-processing">Text Processing</TabsTrigger>
              <TabsTrigger 
                value="embedding-generation" 
                disabled={!textProcessed}
                className={!textProcessed ? "opacity-50 cursor-not-allowed" : ""}
              >
                Embedding Generation
              </TabsTrigger>
            </TabsList>
            <TabsContent value="text-processing" className="mt-4 space-y-4">
              <div className="p-4 border rounded-md bg-gray-50">
                <h3 className="font-medium mb-2">Step 1: Process Document Text</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Split your document into semantic chunks for better AI understanding and processing.
                </p>
                <TextProcessingButton 
                  fileId={fileId} 
                  onProcessComplete={(success) => setTextProcessed(success)}
                />
              </div>
            </TabsContent>
            <TabsContent value="embedding-generation" className="mt-4 space-y-4">
              <div className="p-4 border rounded-md bg-gray-50">
                <h3 className="font-medium mb-2">Step 2: Generate Embeddings</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Create vector embeddings for your document chunks to enable semantic search.
                </p>
                <p className="text-xs text-blue-600 italic">
                  (Embedding generation will be implemented in the next phase)
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </motion.div>
  );
}
