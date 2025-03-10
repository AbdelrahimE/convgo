
import { parse, ParseResult } from 'papaparse';

/**
 * CSV processing utilities using Papa Parse for more reliable handling
 * This module provides specialized handling for CSV files with proper header support
 */

/**
 * Extracts text from CSV using Papa Parse
 * @param fileContent The raw CSV file content
 * @returns Parsed CSV content with preserved structure
 */
export function parseCSVContent(fileContent: string): ParseResult<any> {
  console.log('Parsing CSV content with Papa Parse');
  
  try {
    // Use Papa Parse to parse the CSV with header detection
    const result = parse(fileContent, {
      header: true,        // First row is treated as headers
      skipEmptyLines: true, // Skip empty lines
      dynamicTyping: false, // Keep everything as strings
      encoding: 'utf8',    // UTF-8 encoding
    });
    
    console.log(`Successfully parsed CSV with ${result.data.length} rows and ${result.meta.fields?.length || 0} columns`);
    
    return result;
  } catch (error) {
    console.error('Error parsing CSV content:', error);
    throw new Error(`Failed to parse CSV: ${error.message}`);
  }
}

/**
 * Chunks CSV data with header row included in each chunk
 * @param parsedResult The parsed CSV result from Papa Parse
 * @param chunkSize Target chunk size (approximate number of rows per chunk)
 * @returns Array of CSV chunks with headers in each chunk
 */
export function chunkParsedCSV(parsedResult: ParseResult<any>, chunkSize: number = 50): string[] {
  if (!parsedResult.data || parsedResult.data.length === 0) {
    console.log('No CSV data to chunk');
    return [];
  }
  
  const { data, meta } = parsedResult;
  const headers = meta.fields || [];
  
  if (headers.length === 0) {
    console.log('No headers found in CSV');
    return [stringify(data)]; // Return as single chunk if no headers
  }
  
  console.log(`Chunking CSV with ${data.length} rows into chunks of ~${chunkSize} rows`);
  
  // Calculate how many chunks we'll need
  const chunks: string[] = [];
  const rowsPerChunk = Math.max(1, chunkSize);
  
  // Split data into chunks
  for (let i = 0; i < data.length; i += rowsPerChunk) {
    const chunkData = data.slice(i, i + rowsPerChunk);
    
    // Convert chunk back to CSV string with headers
    const csvString = unparse({
      fields: headers,
      data: chunkData
    });
    
    chunks.push(csvString);
    console.log(`Created chunk ${chunks.length} with ${chunkData.length} rows`);
  }
  
  return chunks;
}

/**
 * Converts CSV data back to string format
 * @param data The data to convert to CSV
 * @returns CSV formatted string
 */
function stringify(data: any[]): string {
  if (!data || data.length === 0) return '';
  
  // Get all possible fields from all objects
  const allFields = new Set<string>();
  data.forEach(row => {
    Object.keys(row).forEach(key => allFields.add(key));
  });
  
  const fields = Array.from(allFields);
  
  // Build CSV string manually if needed
  const header = fields.join(',');
  const rows = data.map(row => {
    return fields.map(field => {
      const value = row[field] === undefined ? '' : row[field];
      // Escape quotes and wrap in quotes if contains comma
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',');
  });
  
  return [header, ...rows].join('\n');
}

/**
 * Convenience function that wraps Papa Parse's unparse
 * @param data Object with fields and data for CSV generation
 * @returns CSV string
 */
function unparse(data: { fields: string[], data: any[] }): string {
  try {
    return parse.unparse(data);
  } catch (error) {
    console.error('Error unparsing CSV data:', error);
    return stringify(data.data); // Fallback to manual stringify
  }
}

/**
 * Creates metadata for CSV chunks processed by Papa Parse
 * @param parsedResult The original parsed CSV data
 * @param chunks The chunked CSV strings
 * @param documentId Document identifier
 * @returns Array of chunks with enhanced metadata
 */
export function createParsedCSVChunkMetadata(
  parsedResult: ParseResult<any>,
  chunks: string[],
  documentId: string
): Array<{ text: string; metadata: Record<string, any> }> {
  const { meta } = parsedResult;
  const headers = meta.fields || [];
  
  return chunks.map((chunk, index) => {
    // Parse this chunk to count rows (subtract 1 for header)
    const chunkData = parse(chunk, { header: true });
    const rowCount = chunkData.data.length;
    
    // Calculate position in the original dataset
    const totalRows = parsedResult.data.length;
    const startPercent = Math.floor((index / chunks.length) * 100);
    const endPercent = Math.floor(((index + 1) / chunks.length) * 100);
    
    // Find potential product name column
    const productNameCol = headers.find(h => 
      /name|product|title/i.test(h.toLowerCase())
    ) || headers[0]; // Default to first column if no product name column found
    
    // Extract product names from this chunk
    const productNames = new Set<string>();
    if (productNameCol) {
      chunkData.data.forEach((row: any) => {
        if (row[productNameCol]) {
          productNames.add(row[productNameCol]);
        }
      });
    }
    
    return {
      text: chunk,
      metadata: {
        document_id: documentId,
        chunk_index: index,
        chunk_count: chunks.length,
        position_percent: `${startPercent}%`,
        character_count: chunk.length,
        is_csv: true,
        row_count: rowCount,
        column_count: headers.length,
        column_headers: headers,
        data_segment: `${startPercent}%-${endPercent}%`,
        data_format: 'tabular',
        total_rows: totalRows,
        product_count: productNames.size,
        products: Array.from(productNames).slice(0, 10) // Include up to 10 product names
      }
    };
  });
}
