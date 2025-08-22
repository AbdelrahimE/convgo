/**
 * Simplified CSV processing utilities
 * Reduced from 488 lines to ~80 lines while maintaining core functionality
 */

import { logger } from '../_shared/logger.ts';
import { ChunkWithMetadata } from '../_shared/types.ts';

/**
 * Simplified detection if extracted text appears to be in CSV format
 * @param text The extracted text content to analyze
 * @param mimeType The original file's mime type (if available)
 * @returns Boolean indicating if the content is likely CSV format
 */
export function isCSVContent(text: string, mimeType?: string): boolean {
  if (!text || text.trim().length === 0) return false;
  
  // Check mime type first (most reliable)
  if (mimeType && (
    mimeType.includes('csv') || 
    mimeType.includes('text/comma-separated-values')
  )) {
    return true;
  }
  
  // Simple content check - look for comma-separated values
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  if (lines.length < 2) return false;
  
  // Check if first few lines have consistent comma count
  const commaCount = lines.slice(0, 3).map(line => (line.match(/,/g) || []).length);
  return commaCount.length > 1 && commaCount[0] > 0 && 
         commaCount.every(count => Math.abs(count - commaCount[0]) <= 1);
}

/**
 * Simplified CSV chunking function
 * @param csvText The CSV text content
 * @param chunkSize Target chunk size
 * @param ensureHeaderInChunks Whether to include header in each chunk
 * @returns Array of CSV chunks
 */
export function chunkCSVContent(
  csvText: string, 
  chunkSize: number,
  ensureHeaderInChunks: boolean = true
): string[] {
  if (!csvText || csvText.trim().length === 0) return [];
  
  const lines = csvText.split('\n').filter(line => line.trim().length > 0);
  if (lines.length < 2) return [csvText];
  
  const headerRow = lines[0];
  const dataRows = lines.slice(1);
  
  logger.log(`Processing CSV with ${dataRows.length} data rows, header included: ${ensureHeaderInChunks}`);
  
  const chunks: string[] = [];
  
  // Calculate approximate rows per chunk
  const avgRowLength = dataRows.reduce((sum, row) => sum + row.length, 0) / dataRows.length;
  const headerLength = ensureHeaderInChunks ? headerRow.length + 1 : 0;
  const rowsPerChunk = Math.max(1, Math.floor((chunkSize - headerLength) / avgRowLength));
  
  // Create chunks
  for (let i = 0; i < dataRows.length; i += rowsPerChunk) {
    const chunkRows = dataRows.slice(i, i + rowsPerChunk);
    
    let chunkContent;
    if (ensureHeaderInChunks) {
      chunkContent = [headerRow, ...chunkRows].join('\n');
    } else {
      chunkContent = chunkRows.join('\n');
    }
    
    chunks.push(chunkContent);
  }
  
  logger.log(`Created ${chunks.length} CSV chunks`);
  return chunks;
}

/**
 * Simplified metadata creation for CSV chunks
 * @param csvText Original CSV text
 * @param chunks The processed CSV chunks
 * @param documentId Document identifier
 * @returns Array of chunks with basic metadata
 */
export function createCSVChunkMetadata(
  csvText: string,
  chunks: string[],
  documentId: string
): ChunkWithMetadata[] {
  const lines = csvText.split('\n').filter(line => line.trim().length > 0);
  const headerRow = lines[0];
  const totalRows = lines.length - 1; // Subtract header
  
  return chunks.map((chunk, index) => {
    const chunkLines = chunk.split('\n').filter(line => line.trim().length > 0);
    const rowCount = chunkLines.length - (chunk.startsWith(headerRow) ? 1 : 0);
    
    return {
      text: chunk,
      metadata: {
        document_id: documentId,
        chunk_index: index,
        chunk_count: chunks.length,
        character_count: chunk.length,
        is_csv: true,
        row_count: rowCount,
        total_rows: totalRows,
        data_format: 'tabular',
        simplified_processing: true // Flag to indicate this is simplified processing
      }
    };
  });
}