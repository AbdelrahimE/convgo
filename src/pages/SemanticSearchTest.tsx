
import { useState } from 'react';
import { useSemanticSearch, SearchOptions } from '@/hooks/use-semantic-search';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2 } from 'lucide-react';

export default function SemanticSearchTest() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    limit: 5,
    threshold: 0.6,
    filterLanguage: true,
    metadataFilters: {}
  });
  
  const { search, clearResults, isSearching, results, error, query } = useSemanticSearch();

  const handleSearch = () => {
    search(searchQuery, searchOptions);
  };

  const updateOption = <K extends keyof SearchOptions>(key: K, value: SearchOptions[K]) => {
    setSearchOptions(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="container mx-auto py-6 max-w-5xl">
      <h1 className="text-3xl font-bold mb-6">Semantic Search Testing</h1>
      <p className="text-gray-600 mb-8">
        Test the RAG (Retrieval Augmented Generation) system by searching through your document embeddings.
        This page demonstrates how the system finds relevant content from your knowledge base.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Search Options</CardTitle>
              <CardDescription>Configure search parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="limit">Result Limit: {searchOptions.limit}</Label>
                <Slider 
                  id="limit"
                  value={[searchOptions.limit || 5]} 
                  min={1} 
                  max={20} 
                  step={1}
                  onValueChange={(value) => updateOption('limit', value[0])}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="threshold">Relevance Threshold: {searchOptions.threshold?.toFixed(2)}</Label>
                <Slider 
                  id="threshold"
                  value={[searchOptions.threshold || 0.6]} 
                  min={0} 
                  max={1} 
                  step={0.05}
                  onValueChange={(value) => updateOption('threshold', value[0])}
                />
                <p className="text-xs text-gray-500">Higher values mean more relevant results</p>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <Switch 
                  id="filterLanguage" 
                  checked={searchOptions.filterLanguage}
                  onCheckedChange={(checked) => updateOption('filterLanguage', checked)}
                />
                <Label htmlFor="filterLanguage">Match query language</Label>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Search Query</CardTitle>
              <CardDescription>Enter a natural language question</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex space-x-2">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter your search query or question..."
                  className="flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}>
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Search
                </Button>
                <Button variant="outline" onClick={clearResults} disabled={isSearching || !results}>
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          {error && (
            <Card className="mt-6 border-red-200 bg-red-50">
              <CardHeader className="py-4">
                <CardTitle className="text-red-600">Error</CardTitle>
              </CardHeader>
              <CardContent>
                <p>{error.message}</p>
              </CardContent>
            </Card>
          )}

          {isSearching && (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Searching...</span>
            </div>
          )}

          {results && results.length > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Search Results</CardTitle>
                <CardDescription>
                  Found {results.length} results for: "{query}"
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {results.map((result, index) => (
                  <Card key={result.id} className="border-l-4" style={{ borderLeftColor: getScoreColor(result.similarity) }}>
                    <CardHeader className="py-3">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-base">Result {index + 1}</CardTitle>
                        <span className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                          Relevance: {(result.similarity * 100).toFixed(1)}%
                        </span>
                      </div>
                      <CardDescription>
                        Language: {result.language || 'Unknown'} 
                        {result.metadata && Object.keys(result.metadata).length > 0 && 
                          ` • Metadata: ${JSON.stringify(result.metadata)}`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="py-2">
                      <div className="bg-gray-50 p-3 rounded whitespace-pre-wrap">
                        {result.content}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </CardContent>
            </Card>
          )}

          {results && results.length === 0 && !isSearching && (
            <Card className="mt-6 border-yellow-200 bg-yellow-50">
              <CardHeader className="py-4">
                <CardTitle>No Results Found</CardTitle>
              </CardHeader>
              <CardContent>
                <p>No matching content found for your query. Try adjusting your search terms or search options.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper function to get color based on similarity score
function getScoreColor(score: number): string {
  if (score >= 0.9) return '#22c55e'; // Green
  if (score >= 0.75) return '#16a34a';
  if (score >= 0.6) return '#eab308'; // Yellow
  if (score >= 0.45) return '#f97316'; // Orange
  return '#ef4444'; // Red
}
