
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSemanticSearch, SearchResult } from '@/hooks/use-semantic-search';
import { useContextAssembly, AssembledContext } from '@/hooks/use-context-assembly';
import { useAIResponse } from '@/hooks/use-ai-response';
import { Textarea } from '@/components/ui/textarea';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, Lightbulb } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export default function SemanticSearchTest() {
  const [query, setQuery] = useState('');
  const [resultLimit, setResultLimit] = useState(5);
  const [threshold, setThreshold] = useState(0.7);
  const [filterByLanguage, setFilterByLanguage] = useState(false);
  const [activeTab, setActiveTab] = useState('search');
  const [temperature, setTemperature] = useState(0.3);
  const [customSystemPrompt, setCustomSystemPrompt] = useState('');
  const [useCustomPrompt, setUseCustomPrompt] = useState(false);
  
  // Prompt generator state
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [userDescription, setUserDescription] = useState('');
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  
  const { 
    search, 
    isSearching, 
    results, 
    queryInfo, 
    meta, 
    error: searchError 
  } = useSemanticSearch();

  const {
    assembleContext,
    isAssembling,
    assembledContext,
    error: assemblyError,
  } = useContextAssembly();

  const {
    generateResponse,
    isGenerating,
    responseResult,
    error: responseError,
  } = useAIResponse();

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    const searchResults = await search({
      query,
      limit: resultLimit,
      threshold,
      filterLanguage: filterByLanguage && queryInfo?.detectedLanguage ? queryInfo.detectedLanguage : undefined
    });

    if (searchResults && searchResults.length > 0) {
      const assembled = await assembleContext(searchResults);
      if (assembled) {
        await generateResponse(query, assembled.context, {
          temperature,
          systemPrompt: useCustomPrompt ? customSystemPrompt : undefined
        });
      }
    }
  };

  const handleGenerateSystemPrompt = async () => {
    if (!userDescription.trim()) {
      toast.error('Please enter a description of what you want the AI to do');
      return;
    }

    try {
      setIsGeneratingPrompt(true);
      
      const { data, error } = await supabase.functions.invoke('generate-system-prompt', {
        body: { description: userDescription }
      });

      if (error) throw error;
      
      if (data.success && data.prompt) {
        setCustomSystemPrompt(data.prompt);
        setUseCustomPrompt(true);
        setPromptDialogOpen(false);
        setUserDescription('');
        toast.success('System prompt generated successfully');
      } else {
        throw new Error('Failed to generate system prompt');
      }
    } catch (error) {
      console.error('Error generating system prompt:', error);
      toast.error('Failed to generate system prompt. Please try again.');
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  return (
    <div className="container max-w-6xl mx-auto py-6">
      <h1 className="text-3xl font-bold mb-6">Semantic Search Test</h1>
      
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Search Parameters</CardTitle>
              <CardDescription>Configure your search query and parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="query">Search Query</Label>
                <div className="flex gap-2">
                  <Input
                    id="query"
                    placeholder="Enter your search query..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="flex-1"
                  />
                  <Button 
                    onClick={handleSearch}
                    disabled={isSearching || !query.trim()}
                  >
                    {isSearching ? 'Searching...' : 'Search'}
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Result Limit: {resultLimit}</Label>
                </div>
                <Slider
                  value={[resultLimit]}
                  onValueChange={(values) => setResultLimit(values[0])}
                  max={20}
                  min={1}
                  step={1}
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Similarity Threshold: {threshold.toFixed(2)}</Label>
                </div>
                <Slider
                  value={[threshold]}
                  onValueChange={(values) => setThreshold(values[0])}
                  max={0.99}
                  min={0.1}
                  step={0.01}
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="language-filter"
                  checked={filterByLanguage}
                  onCheckedChange={setFilterByLanguage}
                />
                <Label htmlFor="language-filter">
                  Filter by query language
                </Label>
              </div>
            </CardContent>
            <CardFooter>
              {queryInfo && (
                <div className="text-sm text-muted-foreground">
                  {queryInfo.detectedLanguage && (
                    <p>Detected language: <span className="font-semibold">{queryInfo.detectedLanguage}</span></p>
                  )}
                </div>
              )}
            </CardFooter>
          </Card>
          
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>AI Response Settings</CardTitle>
              <CardDescription>Customize how the AI responds to queries</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Temperature: {temperature.toFixed(2)}</Label>
                </div>
                <Slider
                  value={[temperature]}
                  onValueChange={(values) => setTemperature(values[0])}
                  max={1.0}
                  min={0.0}
                  step={0.05}
                />
                <p className="text-xs text-muted-foreground">
                  Lower values (0.0) are more focused and deterministic, higher values (1.0) are more creative.
                </p>
              </div>
              
              <div className="pt-2 space-y-2">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="custom-prompt"
                    checked={useCustomPrompt}
                    onCheckedChange={setUseCustomPrompt}
                  />
                  <Label htmlFor="custom-prompt">
                    Use custom system prompt
                  </Label>
                </div>
                
                {useCustomPrompt && (
                  <div className="space-y-2 mt-2">
                    <Label htmlFor="system-prompt">System Prompt</Label>
                    <div className="flex flex-col gap-2">
                      <Textarea
                        id="system-prompt"
                        placeholder="Enter custom system prompt..."
                        value={customSystemPrompt}
                        onChange={(e) => setCustomSystemPrompt(e.target.value)}
                        className="min-h-[120px]"
                      />
                      <Button 
                        variant="outline" 
                        className="w-full mt-1"
                        onClick={() => setPromptDialogOpen(true)}
                      >
                        <Lightbulb className="mr-2 h-4 w-4" />
                        Generate System Prompt
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This controls how the AI behaves. Leave blank to use the default WhatsApp assistant prompt.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Results</CardTitle>
              {meta && (
                <CardDescription>
                  Found {meta.count} results with threshold {meta.threshold.toFixed(2)}
                </CardDescription>
              )}
            </CardHeader>
            
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="search">Search Results</TabsTrigger>
                  <TabsTrigger value="assembled" disabled={!assembledContext}>
                    Assembled Context {isAssembling && '(Building...)'}
                  </TabsTrigger>
                  <TabsTrigger value="ai-response" disabled={!responseResult}>
                    AI Response {isGenerating && '(Generating...)'}
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="search" className="mt-4">
                  {searchError && (
                    <div className="bg-destructive/10 text-destructive p-4 rounded-md mb-4">
                      <p className="font-semibold">Error</p>
                      <p>{searchError.message}</p>
                    </div>
                  )}
                  
                  {results.length === 0 && !searchError && !isSearching ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No results found. Try a different query or adjust your search parameters.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {results.map((result, index) => (
                        <SearchResultCard key={result.id} result={result} index={index + 1} />
                      ))}
                    </div>
                  )}
                  
                  {isSearching && (
                    <div className="text-center py-8">
                      <p>Searching...</p>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="assembled" className="mt-4">
                  {assemblyError && (
                    <div className="bg-destructive/10 text-destructive p-4 rounded-md mb-4">
                      <p className="font-semibold">Error</p>
                      <p>{assemblyError.message}</p>
                    </div>
                  )}
                  
                  {!assembledContext && !assemblyError && !isAssembling ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No assembled context available. Perform a search first.</p>
                    </div>
                  ) : isAssembling ? (
                    <div className="text-center py-8">
                      <p>Assembling context...</p>
                    </div>
                  ) : (
                    <AssembledContextDisplay context={assembledContext!} />
                  )}
                </TabsContent>
                
                <TabsContent value="ai-response" className="mt-4">
                  {responseError && (
                    <div className="bg-destructive/10 text-destructive p-4 rounded-md mb-4">
                      <p className="font-semibold">Error</p>
                      <p>{responseError.message}</p>
                    </div>
                  )}
                  
                  {!responseResult && !responseError && !isGenerating ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No AI response available. Perform a search first.</p>
                    </div>
                  ) : isGenerating ? (
                    <div className="text-center py-8">
                      <p>Generating AI response...</p>
                    </div>
                  ) : (
                    <AIResponseDisplay response={responseResult!} query={query} />
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Prompt Generator Dialog */}
      <Dialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>AI Prompt Generator</DialogTitle>
            <DialogDescription>
              Describe what you want the AI to do in your own words, and we'll create a powerful system prompt for you.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium">
                Your Description
              </Label>
              <Textarea
                id="description"
                placeholder="Example: I need an AI assistant that can answer customer questions about our product return policy in a friendly but professional tone."
                value={userDescription}
                onChange={(e) => setUserDescription(e.target.value)}
                className="min-h-[120px]"
              />
            </div>
            
            <div className="space-y-2">
              <p className="text-sm font-medium">Example Descriptions:</p>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>• I need an AI bot that helps customers troubleshoot technical issues with our software</p>
                <p>• I want an assistant that provides factual information about our company policies</p>
                <p>• I need a sales assistant that can answer questions about our products and pricing</p>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPromptDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleGenerateSystemPrompt}
              disabled={isGeneratingPrompt || !userDescription.trim()}
            >
              {isGeneratingPrompt ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 
                  Generating...
                </>
              ) : (
                'Generate Prompt'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SearchResultCard({ result, index }: { result: SearchResult; index: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg">Result #{index}</CardTitle>
          <div className="bg-primary/10 text-primary px-2 py-1 rounded-full text-sm">
            {(result.similarity * 100).toFixed(1)}% match
          </div>
        </div>
        <CardDescription>
          Language: {result.language || 'Unknown'} | 
          Chunk ID: {result.chunk_id.substring(0, 8)}... | 
          File ID: {result.file_id.substring(0, 8)}...
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="bg-muted p-3 rounded-md overflow-auto max-h-60">
          <pre className="whitespace-pre-wrap text-sm">{result.content}</pre>
        </div>
        
        {result.metadata && Object.keys(result.metadata).length > 0 && (
          <div className="mt-3">
            <p className="font-semibold text-sm mb-1">Metadata:</p>
            <div className="bg-muted p-2 rounded-md overflow-auto max-h-40">
              <pre className="text-xs">{JSON.stringify(result.metadata, null, 2)}</pre>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AssembledContextDisplay({ context }: { context: AssembledContext }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Assembled Context</CardTitle>
          <CardDescription>
            {context.stats.assembledChunks} of {context.stats.originalChunks} chunks assembled | 
            Est. {context.stats.totalTokenEstimate} tokens
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted p-3 rounded-md overflow-auto max-h-[500px]">
            <pre className="whitespace-pre-wrap text-sm">{context.context}</pre>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sources</CardTitle>
          <CardDescription>
            {context.sources.length} documents referenced
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {context.sources.map((source, index) => (
              <div key={index} className="bg-muted p-3 rounded-md">
                <p className="font-semibold">Document: {source.file_id.substring(0, 8)}...</p>
                <p className="text-sm">Chunks used: {source.chunk_ids.length}</p>
                <div className="text-xs text-muted-foreground mt-1">
                  Chunk IDs: {source.chunk_ids.map(id => id.substring(0, 6) + '...').join(', ')}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AIResponseDisplay({ response, query }: { 
  response: { 
    answer: string;
    model: string;
    usage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    }
  }; 
  query: string 
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">AI Response</CardTitle>
          <CardDescription>
            Model: {response.model} | 
            Tokens: {response.usage.total_tokens} total
            ({response.usage.prompt_tokens} prompt, {response.usage.completion_tokens} completion)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-primary/5 p-3 rounded-md mb-4">
            <p className="font-semibold text-sm mb-1">Query:</p>
            <p className="text-sm">{query}</p>
          </div>
          <div className="bg-muted p-4 rounded-md">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {response.answer.split('\n').map((paragraph, i) => 
                paragraph ? <p key={i}>{paragraph}</p> : <br key={i} />
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
