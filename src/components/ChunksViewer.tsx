import { useState, useEffect } from "react";
import { X, Search, Languages, FileText, Copy, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import logger from '@/utils/logger';

interface TextChunk {
  id: string;
  content: string;
  chunk_order: number;
  language: string | null;
  direction: string | null;
  metadata: any;
}

interface ChunksViewerProps {
  fileId: string | null;
  fileName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ChunksViewer({ fileId, fileName, isOpen, onClose }: ChunksViewerProps) {
  const [chunks, setChunks] = useState<TextChunk[]>([]);
  const [filteredChunks, setFilteredChunks] = useState<TextChunk[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedChunkId, setCopiedChunkId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (fileId && isOpen) {
      fetchChunks();
    }
  }, [fileId, isOpen]);

  useEffect(() => {
    if (searchTerm) {
      const filtered = chunks.filter(chunk =>
        chunk.content.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredChunks(filtered);
    } else {
      setFilteredChunks(chunks);
    }
  }, [searchTerm, chunks]);

  const fetchChunks = async () => {
    if (!fileId) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('text_chunks')
        .select('*')
        .eq('file_id', fileId)
        .order('chunk_order', { ascending: true });

      if (error) {
        logger.error('Error fetching chunks:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load text chunks"
        });
        return;
      }

      setChunks(data || []);
    } catch (error) {
      logger.error('Exception fetching chunks:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyChunk = async (chunk: TextChunk) => {
    try {
      await navigator.clipboard.writeText(chunk.content);
      setCopiedChunkId(chunk.id);
      setTimeout(() => setCopiedChunkId(null), 2000);
      
      toast({
        title: "Copied!",
        description: "Chunk content copied to clipboard"
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to copy to clipboard"
      });
    }
  };

  const getLanguageColor = (language: string | null) => {
    if (!language) return "bg-gray-100 text-gray-800";
    
    const colors: Record<string, string> = {
      'arabic': 'bg-green-100 text-green-800',
      'english': 'bg-blue-100 text-blue-800',
      'french': 'bg-purple-100 text-purple-800',
      'spanish': 'bg-orange-100 text-orange-800',
    };
    
    return colors[language.toLowerCase()] || 'bg-slate-100 text-slate-800';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] w-[min(calc(100vw-2rem),64rem)] sm:w-full rounded-xl sm:rounded-2xl border-0 overflow-hidden overflow-x-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 text-base sm:text-lg">
            <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="truncate">Text Chunks - {fileName}</span>
          </DialogTitle>
          <DialogDescription className="text-sm text-left">
            View and analyze the text chunks generated from your document
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 py-4 border-b">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search within chunks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 text-sm"
            />
          </div>
          <div className="flex items-center justify-between sm:justify-end space-x-2 text-xs sm:text-sm text-muted-foreground">
            <span>{filteredChunks.length} of {chunks.length} chunks</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-blue-500 rounded-full animate-pulse" />
                <span className="text-muted-foreground">Loading chunks...</span>
              </div>
            </div>
          ) : filteredChunks.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-slate-400 mb-4" />
              <h3 className="text-lg font-medium mb-2">No chunks found</h3>
              <p className="text-sm text-muted-foreground">
                {searchTerm ? 'No chunks match your search.' : 'This file has not been processed yet.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {filteredChunks.map((chunk, index) => (
                <Card key={chunk.id} className="group">
                  <CardHeader className="pb-3 px-3 sm:px-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-2 sm:space-y-0">
                      <div className="flex items-center space-x-2 min-w-0">
                        <CardTitle className="text-sm font-medium">
                          Chunk #{chunk.chunk_order + 1}
                        </CardTitle>
                        {chunk.language && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge className={`${getLanguageColor(chunk.language)} text-xs`}>
                                  <Languages className="h-2 w-2 sm:h-3 sm:w-3 mr-1" />
                                  <span className="hidden sm:inline">{chunk.language}</span>
                                  <span className="sm:hidden">{chunk.language.substring(0, 2).toUpperCase()}</span>
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Detected language: {chunk.language}</p>
                                {chunk.direction && <p>Text direction: {chunk.direction}</p>}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyChunk(chunk)}
                        className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity self-end sm:self-auto"
                      >
                        {copiedChunkId === chunk.id ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                        <span className="ml-2 text-xs sm:hidden">Copy</span>
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="px-3 sm:px-6">
                    <div className="bg-slate-50 dark:bg-slate-900 p-2 sm:p-3 rounded-lg max-h-60 overflow-y-auto overflow-x-hidden w-full max-w-full">
                      <pre className="whitespace-pre-wrap break-words break-all text-xs sm:text-sm font-mono leading-relaxed">
                        {chunk.content}
                      </pre>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mt-3 space-y-1 sm:space-y-0 text-xs text-muted-foreground">
                      <span>{chunk.content.length} characters</span>
                      <span>Position: {chunk.chunk_order + 1} of {chunks.length}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
