
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

// Create a simple logger since we can't use @/utils/logger in edge functions
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

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
  query?: string; // Added to support filtering by relevance to query
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
    const { results, maxContextLength = 8000, query } = await req.json() as AssemblyRequest;

    // MODIFIED: More lenient validation - if no results, return empty context instead of error
    if (!results || !Array.isArray(results)) {
      logger.log('No valid search results provided, returning empty context');
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          assembled: {
            context: '',
            sources: [],
            stats: {
              originalChunks: 0,
              assembledChunks: 0,
              totalTokenEstimate: 0
            }
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // If results array is empty, return empty context instead of error
    if (results.length === 0) {
      logger.log('Empty results array provided, returning empty context');
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          assembled: {
            context: '',
            sources: [],
            stats: {
              originalChunks: 0,
              assembledChunks: 0,
              totalTokenEstimate: 0
            }
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    logger.log(`Processing ${results.length} chunks for context assembly`);

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
        
        // MODIFIED: First pass - Add all chunks with similarity above threshold
        // This ensures we include important chunks regardless of contiguity
        chunksWithPosition.forEach(chunk => {
          // Include chunks with sufficient similarity - LOWERED threshold further to ensure inclusion
          if (!usedChunkIds.has(chunk.chunk_id) && chunk.similarity > 0.2) { // Lowered threshold even more
            assembledChunks.push(chunk);
            usedChunkIds.add(chunk.chunk_id);
            fileSource.chunk_ids.push(chunk.chunk_id);
            logger.log(`Including chunk with position ${chunk.metadata.chunk_index ?? chunk.metadata.position} and similarity ${chunk.similarity}`);
          }
        });
        
        // MODIFIED: Second pass - Try to include any remaining contiguous chunks
        // that might have lower similarity but provide context
        let lastAdded = -2;
        chunksWithPosition.forEach(chunk => {
          const position = chunk.metadata.chunk_index !== undefined ? 
            chunk.metadata.chunk_index : chunk.metadata.position;
          
          // Only add if not already used and if it's contiguous to previously added chunk
          if (!usedChunkIds.has(chunk.chunk_id) && position === lastAdded + 1) {
            assembledChunks.push(chunk);
            usedChunkIds.add(chunk.chunk_id);
            fileSource.chunk_ids.push(chunk.chunk_id);
            lastAdded = position;
            logger.log(`Including contiguous chunk at position ${position}`);
          }
        });
      }
      
      // Add remaining high similarity chunks that weren't processed above
      chunks.forEach(chunk => {
        if (!usedChunkIds.has(chunk.chunk_id) && chunk.similarity > 0.2) { // Lowered threshold even more
          assembledChunks.push(chunk);
          usedChunkIds.add(chunk.chunk_id);
          fileSource.chunk_ids.push(chunk.chunk_id);
          logger.log(`Including standalone chunk with similarity ${chunk.similarity}`);
        }
      });
      
      // MODIFIED: Be even more lenient - always include at least the top 5 chunks from each file
      if (fileSource.chunk_ids.length === 0 && chunks.length > 0) {
        // Sort by similarity and take up to 5 top chunks (increased from 3)
        const topChunks = [...chunks]
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, Math.min(5, chunks.length));
        
        topChunks.forEach(chunk => {
          assembledChunks.push(chunk);
          usedChunkIds.add(chunk.chunk_id);
          fileSource.chunk_ids.push(chunk.chunk_id);
          logger.log(`Including top chunk from file ${fileId} with similarity ${chunk.similarity}`);
        });
      }
      
      if (fileSource.chunk_ids.length > 0) {
        sources.push(fileSource);
      }
    });
    
    // MODIFIED: More lenient logic - always include at least something
    if (assembledChunks.length === 0 && results.length > 0) {
      logger.log(`No chunks passed the filtering criteria. Including all results by default.`);
      // Just include all results if nothing else was selected
      results.forEach(result => {
        assembledChunks.push(result);
        usedChunkIds.add(result.chunk_id);
        
        // Add to sources
        const existingSource = sources.find(s => s.file_id === result.file_id);
        if (existingSource) {
          existingSource.chunk_ids.push(result.chunk_id);
        } else {
          sources.push({
            file_id: result.file_id,
            chunk_ids: [result.chunk_id]
          });
        }
      });
    }
    
    // Now let's sort the assembled chunks to maintain the original document order
    assembledChunks.sort((a, b) => {
      // First sort by file_id
      if (a.file_id !== b.file_id) {
        return a.file_id.localeCompare(b.file_id);
      }
      
      // Then by position/chunk_index if available
      if (a.metadata && b.metadata) {
        const posA = a.metadata.chunk_index !== undefined ? a.metadata.chunk_index : 
                    (a.metadata.position !== undefined ? a.metadata.position : Number.MAX_SAFE_INTEGER);
        const posB = b.metadata.chunk_index !== undefined ? b.metadata.chunk_index : 
                    (b.metadata.position !== undefined ? b.metadata.position : Number.MAX_SAFE_INTEGER);
        
        if (posA !== Number.MAX_SAFE_INTEGER && posB !== Number.MAX_SAFE_INTEGER) {
          return posA - posB;
        }
      }
      
      // Finally by similarity
      return b.similarity - a.similarity;
    });
    
    // Combine all chunks into a single context string, separated by markers
    let assembledContext = assembledChunks
      .map(chunk => chunk.content.trim())
      .join('\n\n---\n\n');
    
    // Estimate token count (very rough estimate: ~4 chars per token)
    const tokenEstimate = Math.ceil(assembledContext.length / 4);
    
    // Truncate if exceeding max context length
    if (tokenEstimate > maxContextLength) {
      logger.log(`Context too large (est. ${tokenEstimate} tokens), truncating to ~${maxContextLength} tokens`);
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
    logger.error('Error in context-assembly function:', error);
    
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
