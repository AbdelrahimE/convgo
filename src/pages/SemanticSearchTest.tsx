
import React, { useState } from 'react';
import { useSemanticSearch, SearchOptions, SearchResult } from '@/hooks/use-semantic-search';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';

const SemanticSearchTest = () => {
  const { toast } = useToast();
  const { search, clearResults, isSearching, results, error, query } = useSemanticSearch();
  
  // Search query state
  const [searchQuery, setSearchQuery] = useState('');
  
  // Search options state
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    limit: 5,
    threshold: 0.6,
    filterLanguage: true,
    metadataFilters: {}
  });

  // Handle form submission
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      toast({
        title: "Error",
        description: "Search query cannot be empty",
        variant: "destructive"
      });
      return;
    }
    
    await search(searchQuery, searchOptions);
  };
  
  // Update search options
  const updateOptions = (key: keyof SearchOptions, value: any) => {
    setSearchOptions(prev => ({
      ...prev,
      [key]: value
    }));
  };

  return (
    <div className="container py-8 max-w-6xl">
      <h1 className="text-3xl font-bold mb-2">Semantic Search Testing</h1>
      <p className="text-muted-foreground mb-8">
        Test your RAG system by searching through your document embeddings.
      </p>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Search Form */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Search Configuration</CardTitle>
              <CardDescription>
                Configure your search parameters and test different queries
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSearch} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="query">Search Query</Label>
                  <Input
                    id="query"
                    placeholder="Enter your question or search query"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="limit">Result Limit: {searchOptions.limit}</Label>
                    </div>
                    <Slider
                      id="limit"
                      min={1}
                      max={10}
                      step={1}
                      value={[searchOptions.limit || 5]}
                      onValueChange={(value) => updateOptions('limit', value[0])}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="threshold">Similarity Threshold: {searchOptions.threshold?.toFixed(2)}</Label>
                    </div>
                    <Slider
                      id="threshold"
                      min={0}
                      max={1}
                      step={0.05}
                      value={[searchOptions.threshold || 0.6]}
                      onValueChange={(value) => updateOptions('threshold', value[0])}
                    />
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="filterLanguage"
                      checked={searchOptions.filterLanguage}
                      onCheckedChange={(value) => updateOptions('filterLanguage', value)}
                    />
                    <Label htmlFor="filterLanguage">Language Matching</Label>
                  </div>
                </div>
              </form>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={clearResults} disabled={isSearching}>
                Clear Results
              </Button>
              <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}>
                {isSearching ? "Searching..." : "Search"}
              </Button>
            </CardFooter>
          </Card>
        </div>
        
        {/* Results Display */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Search Results</CardTitle>
              {query && (
                <CardDescription>
                  Results for: "{query}"
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {error && (
                <div className="bg-destructive/10 text-destructive p-4 rounded-md mb-4">
                  <p className="font-medium">Error</p>
                  <p className="text-sm">{error.message}</p>
                </div>
              )}
              
              {results && results.length === 0 && (
                <div className="bg-muted p-8 rounded-md text-center">
                  <p className="text-muted-foreground">No matching results found.</p>
                  <p className="text-sm text-muted-foreground mt-2">Try adjusting your search query or lowering the similarity threshold.</p>
                </div>
              )}
              
              {results && results.length > 0 && (
                <div className="space-y-6">
                  <div className="bg-muted p-4 rounded-md">
                    <p className="text-sm font-medium">Found {results.length} relevant document chunks</p>
                  </div>
                  
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-6">
                      {results.map((result, index) => (
                        <ResultCard key={result.id} result={result} index={index} />
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
              
              {!results && !error && (
                <div className="bg-muted p-8 rounded-md text-center">
                  <p className="text-muted-foreground">Enter a search query to test your RAG system.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

// Helper component to display individual search results
const ResultCard = ({ result, index }: { result: SearchResult; index: number }) => {
  return (
    <Card className="overflow-hidden border-l-4" style={{ borderLeftColor: getScoreColor(result.similarity) }}>
      <CardHeader className="py-3">
        <div className="flex justify-between items-center">
          <CardTitle className="text-base">
            Result #{index + 1}
          </CardTitle>
          <span className="px-2 py-1 bg-muted rounded-md text-xs">
            Score: {result.similarity.toFixed(4)}
          </span>
        </div>
        <CardDescription className="flex flex-wrap gap-2 text-xs">
          {result.language && (
            <span className="px-2 py-1 bg-primary/10 rounded-md">
              Language: {result.language}
            </span>
          )}
          {result.file_id && (
            <span className="px-2 py-1 bg-primary/10 rounded-md">
              File ID: {formatId(result.file_id)}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="py-2">
        <Tabs defaultValue="content">
          <TabsList className="mb-2">
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="metadata">Metadata</TabsTrigger>
          </TabsList>
          <TabsContent value="content">
            <ScrollArea className="h-[120px] w-full rounded-md border p-2">
              <pre className="text-sm whitespace-pre-wrap">{result.content}</pre>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="metadata">
            <ScrollArea className="h-[120px] w-full rounded-md border p-2">
              <pre className="text-sm">{JSON.stringify(result.metadata, null, 2)}</pre>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

// Helper function to truncate IDs for display
const formatId = (id: string) => {
  return id.substring(0, 8) + '...';
};

// Helper function to get color based on similarity score
const getScoreColor = (score: number) => {
  if (score >= 0.9) return '#10b981'; // Green for high similarity
  if (score >= 0.7) return '#22c55e';
  if (score >= 0.5) return '#eab308'; // Yellow for medium similarity
  return '#ef4444'; // Red for low similarity
};

export default SemanticSearchTest;
