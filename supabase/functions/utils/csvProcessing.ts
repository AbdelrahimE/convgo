
/**
 * CSV-specific processing utilities to improve handling of tabular data
 * This module provides specialized handling for CSV files in the text extraction process
 */

/**
 * Detects if extracted text appears to be in CSV format
 * @param text The extracted text content to analyze
 * @param mimeType The original file's mime type (if available)
 * @returns Boolean indicating if the content is likely CSV format
 */
export function isCSVContent(text: string, mimeType?: string): boolean {
  if (!text || text.trim().length === 0) return false;
  
  // Check mime type first (most reliable)
  if (mimeType && (
    mimeType.includes('csv') || 
    mimeType.includes('text/comma-separated-values') ||
    mimeType.includes('application/vnd.ms-excel')
  )) {
    // Verify with content check to be sure
    return hasCSVStructure(text);
  }
  
  // If mime type doesn't indicate CSV, check content patterns
  return hasCSVStructure(text);
}

/**
 * Analyzes text structure to determine if it matches CSV patterns
 * @param text Text content to analyze
 * @returns Boolean indicating if the text appears to be CSV formatted
 */
function hasCSVStructure(text: string): boolean {
  // Get first few non-empty lines for analysis
  const lines = text.split('\n')
    .filter(line => line.trim().length > 0)
    .slice(0, Math.min(10, text.split('\n').length));
  
  if (lines.length < 2) return false;
  
  // Count commas in each line
  const commaCount = lines.map(line => (line.match(/,/g) || []).length);
  
  // CSV typically has consistent number of commas per line
  // Allow for small variations (±1) to account for quoted fields
  let consistentCommas = true;
  for (let i = 1; i < commaCount.length; i++) {
    if (Math.abs(commaCount[i] - commaCount[0]) > 1) {
      consistentCommas = false;
      break;
    }
  }
  
  // Check for quote-enclosed fields with commas inside (common in CSV)
  const hasQuotedFields = /("[^"]*,.*?"|'[^']*,.*?')/.test(text);
  
  // Check for header row pattern (different data types in first row vs others)
  const potentialHeaderRow = lines[0];
  const headerHasText = /[a-zA-Z]{3,}/.test(potentialHeaderRow);
  
  // Data rows often contain more numbers than header rows
  const dataRowsHaveNumbers = lines.slice(1).some(line => 
    (line.match(/\d+/g) || []).length > (potentialHeaderRow.match(/\d+/g) || []).length
  );
  
  // Consider it CSV if it has consistent commas and either quoted fields or appears to have a header
  return consistentCommas && (hasQuotedFields || (headerHasText && dataRowsHaveNumbers));
}

/**
 * Identifies the header row(s) in CSV content
 * @param csvText The CSV text content
 * @returns The header row(s) as a string
 */
export function extractCSVHeader(csvText: string): string {
  if (!csvText || csvText.trim().length === 0) return '';
  
  const lines = csvText.split('\n').filter(line => line.trim().length > 0);
  if (lines.length === 0) return '';
  
  // In most CSVs, the first row is the header
  return lines[0];
}

/**
 * Processes CSV text into semantic chunks while preserving row integrity
 * and maintaining header context
 * @param csvText The CSV text content
 * @param chunkSize Maximum desired chunk size
 * @returns Array of chunks with preserved CSV structure
 */
export function chunkCSVContent(csvText: string, chunkSize: number): string[] {
  if (!csvText || csvText.trim().length === 0) return [];
  
  const lines = csvText.split('\n').filter(line => line.trim().length > 0);
  if (lines.length < 2) return [csvText]; // If very small, return as is
  
  // Extract header row(s)
  const headerRow = extractCSVHeader(csvText);
  
  // Initialize result array and current chunk
  const chunks: string[] = [];
  let currentChunk: string[] = [headerRow];
  let currentSize = headerRow.length + 1; // +1 for newline
  
  // Process data rows (skip header)
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    
    // If adding this row would exceed chunk size, start a new chunk
    // But only if we already have some content beyond the header
    if (currentSize + row.length + 1 > chunkSize && currentChunk.length > 1) {
      chunks.push(currentChunk.join('\n'));
      currentChunk = [headerRow]; // Start new chunk with header
      currentSize = headerRow.length + 1;
    }
    
    // Add the row to current chunk
    currentChunk.push(row);
    currentSize += row.length + 1;
  }
  
  // Add the last chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n'));
  }
  
  return chunks;
}

/**
 * Creates improved metadata for CSV chunks, adding column/row information
 * @param csvText Original CSV text
 * @param chunks The processed CSV chunks
 * @param documentId Document identifier
 * @returns Array of chunks with enhanced metadata
 */
export function createCSVChunkMetadata(
  csvText: string,
  chunks: string[],
  documentId: string
): Array<{ text: string; metadata: Record<string, any> }> {
  // Extract header for analysis
  const headerRow = extractCSVHeader(csvText);
  const headers = headerRow.split(',').map(h => h.trim().replace(/^["'](.*)["']$/, '$1'));
  
  return chunks.map((chunk, index) => {
    // Count rows in this chunk (subtract 1 for header)
    const rowCount = chunk.split('\n').length - 1;
    
    // Determine which part of the full dataset this chunk represents
    const totalRows = csvText.split('\n').filter(line => line.trim().length > 0).length - 1;
    const startPercent = Math.floor((index / chunks.length) * 100);
    const endPercent = Math.floor(((index + 1) / chunks.length) * 100);
    
    // Find position of this chunk in original document
    const chunkWithoutHeader = chunk.split('\n').slice(1).join('\n');
    const position = csvText.indexOf(chunkWithoutHeader);
    
    return {
      text: chunk,
      metadata: {
        document_id: documentId,
        chunk_index: index,
        chunk_count: chunks.length,
        position: position >= 0 ? position : undefined,
        character_count: chunk.length,
        is_csv: true,
        row_count: rowCount,
        column_count: headers.length,
        column_headers: headers,
        data_segment: `${startPercent}%-${endPercent}%`,
        data_format: 'tabular',
        total_rows: totalRows
      }
    };
  });
}
