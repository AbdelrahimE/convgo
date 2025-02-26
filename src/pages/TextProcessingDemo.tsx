
import { useState } from 'react';
import { useTextProcessing } from '@/hooks/use-text-processing';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function TextProcessingDemo() {
  const [text, setText] = useState('');
  const [documentId, setDocumentId] = useState(`doc-${Math.random().toString(36).substring(2, 9)}`);
  const [chunkSize, setChunkSize] = useState(512);
  const [chunkOverlap, setChunkOverlap] = useState(50);
  const [splitBySentence, setSplitBySentence] = useState(true);
  const [activeTab, setActiveTab] = useState('chunks');

  const { processDocument, isProcessing, result } = useTextProcessing();

  const handleProcessText = async () => {
    if (!text.trim()) {
      toast.error('Please enter some text to process');
      return;
    }

    try {
      await processDocument(text, documentId, {
        chunkSize,
        chunkOverlap,
        splitBySentence
      });
      toast.success('Text processed successfully');
    } catch (error) {
      toast.error('Error processing text: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  return (
    <div className="container max-w-5xl py-8">
      <h1 className="text-2xl font-bold mb-6">Text Processing Demo</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Input Text</CardTitle>
            <CardDescription>
              Enter the text you want to process and chunk for embeddings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="document-id">Document ID</Label>
                <Input
                  id="document-id"
                  value={documentId}
                  onChange={(e) => setDocumentId(e.target.value)}
                  className="mb-4"
                />
              </div>
              <div>
                <Label htmlFor="text-input">Text Content</Label>
                <Textarea
                  id="text-input"
                  placeholder="Paste your document text here..."
                  className="min-h-[200px]"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Chunking Options</CardTitle>
            <CardDescription>
              Configure how the text will be divided into chunks
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="chunk-size">Chunk Size: {chunkSize} characters</Label>
                </div>
                <Slider
                  id="chunk-size"
                  min={128}
                  max={1024}
                  step={16}
                  value={[chunkSize]}
                  onValueChange={(value) => setChunkSize(value[0])}
                />
                <p className="text-sm text-muted-foreground">
                  Recommended: 256-512 for most embedding models
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="chunk-overlap">Chunk Overlap: {chunkOverlap} characters</Label>
                </div>
                <Slider
                  id="chunk-overlap"
                  min={0}
                  max={200}
                  step={10}
                  value={[chunkOverlap]}
                  onValueChange={(value) => setChunkOverlap(value[0])}
                />
                <p className="text-sm text-muted-foreground">
                  Overlap between chunks helps maintain context
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="split-sentence"
                  checked={splitBySentence}
                  onCheckedChange={setSplitBySentence}
                />
                <Label htmlFor="split-sentence">Split by sentence boundaries</Label>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              onClick={handleProcessText}
              disabled={isProcessing || !text.trim()}
              className="w-full"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Process Text'
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Processing Results</CardTitle>
            <CardDescription>
              Stats: {result.stats.chunkCount} chunks, Avg {result.stats.averageChunkSize} chars/chunk
            </CardDescription>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="chunks">Chunks ({result.chunks.length})</TabsTrigger>
                <TabsTrigger value="keywords">Keywords ({result.keywords.length})</TabsTrigger>
                <TabsTrigger value="stats">Stats</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            <TabsContent value="chunks" className="mt-0">
              <div className="space-y-4">
                {result.chunks.map((chunk, index) => (
                  <div key={index} className="border rounded-md p-4">
                    <div className="flex justify-between mb-2">
                      <h4 className="font-medium">Chunk {index + 1}</h4>
                      <span className="text-sm text-muted-foreground">
                        {chunk.text.length} chars, {chunk.text.split(/\s+/).filter(Boolean).length} words
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{chunk.text}</p>
                    <Separator className="my-2" />
                    <div className="text-xs text-muted-foreground">
                      <code className="block overflow-x-auto">
                        {JSON.stringify(chunk.metadata, null, 2)}
                      </code>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="keywords" className="mt-0">
              <div className="flex flex-wrap gap-2 py-4">
                {result.keywords.map((keyword, index) => (
                  <Badge key={index} variant="outline">
                    {keyword}
                  </Badge>
                ))}
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                These keywords were extracted using frequency analysis and might be useful for tagging or categorizing content.
              </p>
            </TabsContent>
            <TabsContent value="stats" className="mt-0">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="border rounded-md p-4">
                    <h4 className="font-medium mb-2">Original Text</h4>
                    <p className="text-2xl font-bold">{result.stats.originalLength}</p>
                    <p className="text-sm text-muted-foreground">characters</p>
                  </div>
                  <div className="border rounded-md p-4">
                    <h4 className="font-medium mb-2">Processed Text</h4>
                    <p className="text-2xl font-bold">{result.stats.processedLength}</p>
                    <p className="text-sm text-muted-foreground">characters</p>
                  </div>
                  <div className="border rounded-md p-4">
                    <h4 className="font-medium mb-2">Number of Chunks</h4>
                    <p className="text-2xl font-bold">{result.stats.chunkCount}</p>
                  </div>
                  <div className="border rounded-md p-4">
                    <h4 className="font-medium mb-2">Average Chunk Size</h4>
                    <p className="text-2xl font-bold">{result.stats.averageChunkSize}</p>
                    <p className="text-sm text-muted-foreground">characters</p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
