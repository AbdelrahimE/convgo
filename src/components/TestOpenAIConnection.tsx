
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

const TestOpenAIConnection = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const testConnection = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.functions.invoke('test-openai-connection');
      
      if (error) {
        console.error("Error calling edge function:", error);
        toast({
          variant: "destructive",
          title: "Connection Failed",
          description: `Error: ${error.message}`,
        });
        setResult({ status: 'error', error: error.message });
        return;
      }

      setResult(data);
      
      if (data.status === 'success') {
        toast({
          title: "Connection Successful",
          description: "Successfully connected to OpenAI API",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Connection Failed",
          description: data.message,
        });
      }
    } catch (error: any) {
      console.error("Exception:", error);
      toast({
        variant: "destructive",
        title: "Connection Failed",
        description: `Exception: ${error.message}`,
      });
      setResult({ status: 'error', error: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>OpenAI API Connection Test</CardTitle>
        <CardDescription>
          Test the connection to OpenAI's embedding API
        </CardDescription>
      </CardHeader>
      <CardContent>
        {result && (
          <div className="mt-4 p-4 bg-gray-50 rounded-md">
            <h3 className="font-semibold mb-2">
              Status: {result.status === 'success' 
                ? <span className="text-green-600">Success</span> 
                : <span className="text-red-600">Error</span>}
            </h3>
            {result.status === 'success' ? (
              <div className="space-y-2 text-sm">
                <p>Model: {result.modelUsed}</p>
                <p>Embedding dimensions: {result.embeddingDimensions}</p>
                <p>Sample values: {JSON.stringify(result.firstFewValues)}</p>
              </div>
            ) : (
              <div className="text-red-600 text-sm">
                <p>{result.message}</p>
                {result.error && <p className="mt-2 italic">{result.error}</p>}
              </div>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button 
          onClick={testConnection} 
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? "Testing Connection..." : "Test OpenAI Connection"}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default TestOpenAIConnection;
