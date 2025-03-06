
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

interface SearchResult {
  id: string;
  chunk_id: string;
  file_id: string;
  content: string;
  metadata: any;
  similarity: number;
  language: string;
}

interface AssemblyRequest {
  results: SearchResult[];
  maxContextLength?: number;
}

interface AssembledContext {
  context: string;
  sources: {
    file_id: string;
    chunk_ids: string[];
  }[];
  stats: {
    originalChunks: number;
    assembledChunks: number;
    totalTokenEstimate: number;
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { results, maxContextLength = 8000 } = await req.json() as AssemblyRequest;

    if (!results || !Array.isArray(results) || results.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Valid search results are required' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    console.log(`Processing ${results.length} chunks for context assembly`);

    // Sort results by file_id and then by similarity to get the most relevant chunks per document
    const sortedResults = [...results].sort((a, b) => {
      // First sort by file_id to group documents together
      if (a.file_id !== b.file_id) {
        return a.file_id.localeCompare(b.file_id);
      }
      
      // Within same file, sort by similarity (higher similarity first)
      return b.similarity - a.similarity;
    });

    // Group chunks by file_id to process each document's chunks separately
    const fileGroups = sortedResults.reduce((groups, result) => {
      const fileId = result.file_id;
      if (!groups[fileId]) {
        groups[fileId] = [];
      }
      groups[fileId].push(result);
      return groups;
    }, {} as Record<string, SearchResult[]>);

    // Assemble context from each file group, prioritizing higher similarity chunks
    const assembledChunks: SearchResult[] = [];
    const usedChunkIds = new Set<string>();
    const sources: { file_id: string; chunk_ids: string[] }[] = [];
    
    // For each file, try to assemble contiguous chunks when possible
    Object.entries(fileGroups).forEach(([fileId, chunks]) => {
      const fileSource = { file_id: fileId, chunk_ids: [] as string[] };
      
      // If we have metadata with chunk_index, try to assemble contiguous chunks
      // Sort chunks by their position in the original document if metadata available
      const chunksWithPosition = chunks.filter(chunk => 
        chunk.metadata && (chunk.metadata.chunk_index !== undefined || chunk.metadata.position !== undefined)
      );
      
      if (chunksWithPosition.length > 0) {
        // Sort by position in document
        chunksWithPosition.sort((a, b) => {
          const posA = a.metadata.chunk_index !== undefined ? a.metadata.chunk_index : a.metadata.position;
          const posB = b.metadata.chunk_index !== undefined ? b.metadata.chunk_index : b.metadata.position;
          return posA - posB;
        });
        
        // Add contiguous chunks
        let lastPosition = -2;
        chunksWithPosition.forEach(chunk => {
          const position = chunk.metadata.chunk_index !== undefined ? 
            chunk.metadata.chunk_index : chunk.metadata.position;
          
          // Only add if not already used and if it's contiguous or one of the highest similarity chunks
          if (!usedChunkIds.has(chunk.chunk_id) && 
              (position === lastPosition + 1 || chunk.similarity > 0.8)) {
            assembledChunks.push(chunk);
            usedChunkIds.add(chunk.chunk_id);
            fileSource.chunk_ids.push(chunk.chunk_id);
            lastPosition = position;
          }
        });
      }
      
      // Add remaining high similarity chunks that weren't contiguous
      chunks.forEach(chunk => {
        if (!usedChunkIds.has(chunk.chunk_id) && chunk.similarity > 0.75) {
          assembledChunks.push(chunk);
          usedChunkIds.add(chunk.chunk_id);
          fileSource.chunk_ids.push(chunk.chunk_id);
        }
      });
      
      if (fileSource.chunk_ids.length > 0) {
        sources.push(fileSource);
      }
    });
    
    // Combine all chunks into a single context string, separated by markers
    let assembledContext = assembledChunks
      .map(chunk => chunk.content.trim())
      .join('\n\n---\n\n');
    
    // Estimate token count (very rough estimate: ~4 chars per token)
    const tokenEstimate = Math.ceil(assembledContext.length / 4);
    
    // Truncate if exceeding max context length
    if (tokenEstimate > maxContextLength) {
      console.log(`Context too large (est. ${tokenEstimate} tokens), truncating to ~${maxContextLength} tokens`);
      assembledContext = assembledContext.substring(0, maxContextLength * 4);
    }
    
    const response: AssembledContext = {
      context: assembledContext,
      sources,
      stats: {
        originalChunks: results.length,
        assembledChunks: assembledChunks.length,
        totalTokenEstimate: tokenEstimate
      }
    };

    return new Response(
      JSON.stringify({
        success: true,
        assembled: response
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error in context-assembly function:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
