
import { useState } from 'react';
import { useOpenAI } from '@/hooks/use-openai';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function OpenAITest() {
  const { testConnection, isLoading, result, error, isSuccess, isError } = useOpenAI();
  const [hasAttempted, setHasAttempted] = useState(false);

  const handleTestConnection = async () => {
    setHasAttempted(true);
    await testConnection();
  };

  return (
    <div className="container max-w-3xl py-8">
      <h1 className="text-2xl font-bold mb-6">OpenAI Embeddings API Connection Test</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Test OpenAI Embeddings API Connection</CardTitle>
          <CardDescription>
            Click the button below to test your connection to OpenAI's Embeddings API (text-embedding-3-small)
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          {hasAttempted && (
            <div className="mb-6">
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                </div>
              ) : isSuccess ? (
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <AlertTitle className="text-green-800">Success!</AlertTitle>
                  <AlertDescription className="text-green-700">
                    <p>OpenAI Embeddings API connection was successful.</p>
                    {result?.model && <p className="mt-2"><strong>Model:</strong> {result.model}</p>}
                    {result?.response && (
                      <div className="mt-2">
                        <strong>Response:</strong>
                        <p className="mt-1 p-2 bg-white border rounded">{result.response}</p>
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert className="bg-red-50 border-red-200" variant="destructive">
                  <XCircle className="h-5 w-5 text-red-600" />
                  <AlertTitle className="text-red-800">Connection Error</AlertTitle>
                  <AlertDescription className="text-red-700">
                    {error?.message || result?.message || 'Failed to connect to OpenAI Embeddings API'}
                    {result?.error && (
                      <div className="mt-2 p-2 bg-white border rounded overflow-auto">
                        <pre className="text-xs">{JSON.stringify(result.error, null, 2)}</pre>
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
        
        <CardFooter>
          <Button
            onClick={handleTestConnection}
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isLoading ? 'Testing Connection...' : 'Test Embeddings API Connection'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
