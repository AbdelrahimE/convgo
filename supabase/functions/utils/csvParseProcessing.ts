
/**
 * CSV processing utilities using Papa Parse for more reliable handling
 * This module provides specialized handling for CSV files with proper header support
 */

// Import Papa Parse from a CDN URL that's compatible with Deno
import Papa from 'https://esm.sh/papaparse@5.4.1';

// Create a logger for edge functions that respects configuration
const logger = {
  log: (...args: any[]) => {
    const enableLogs = Deno.env.get('ENABLE_LOGS') === 'true';
    if (enableLogs) console.log(...args);
  },
  error: (...args: any[]) => {
    // Always log errors regardless of setting
    console.error(...args);
  },
  info: (...args: any[]) => {
    const enableLogs = Deno.env.get('ENABLE_LOGS') === 'true';
    if (enableLogs) console.info(...args);
  },
  warn: (...args: any[]) => {
    const enableLogs = Deno.env.get('ENABLE_LOGS') === 'true';
    if (enableLogs) console.warn(...args);
  },
  debug: (...args: any[]) => {
    const enableLogs = Deno.env.get('ENABLE_LOGS') === 'true';
    if (enableLogs) console.debug(...args);
  },
};

/**
 * Extracts text from CSV using Papa Parse
 * @param fileContent The raw CSV file content
 * @returns Parsed CSV content with preserved structure
 */
export function parseCSVContent(fileContent: string): any {
  logger.log('Parsing CSV content with Papa Parse');
  
  try {
    // Use Papa Parse to parse the CSV with header detection
    const result = Papa.parse(fileContent, {
      header: true,        // First row is treated as headers
      skipEmptyLines: true, // Skip empty lines
      dynamicTyping: false, // Keep everything as strings
      encoding: 'utf8',    // UTF-8 encoding
    });
    
    logger.log(`Successfully parsed CSV with ${result.data.length} rows and ${result.meta.fields?.length || 0} columns`);
    
    return result;
  } catch (error) {
    logger.error('Error parsing CSV content:', error);
    throw new Error(`Failed to parse CSV: ${error.message}`);
  }
}

/**
 * Chunks CSV data with header row included in each chunk
 * Uses row size estimation to better approximate the target chunk size
 * @param parsedResult The parsed CSV result from Papa Parse
 * @param chunkSize Target chunk size (approximate character count per chunk)
 * @returns Array of CSV chunks with headers in each chunk
 */
export function chunkParsedCSV(parsedResult: any, chunkSize: number = 50000): string[] {
  if (!parsedResult.data || parsedResult.data.length === 0) {
    logger.log('No CSV data to chunk');
    return [];
  }
  
  const { data, meta } = parsedResult;
  const headers = meta.fields || [];
  
  if (headers.length === 0) {
    logger.log('No headers found in CSV');
    throw new Error('No headers found in CSV data');
  }
  
  // Calculate average row size to better estimate how many rows per chunk
  const headerRow = headers.join(',');
  
  // Sample up to 100 rows to calculate average row size
  const sampleSize = Math.min(data.length, 100);
  let totalSize = 0;
  
  for (let i = 0; i < sampleSize; i++) {
    const rowString = Papa.unparse({
      fields: headers,
      data: [data[i]]
    });
    totalSize += rowString.length - headerRow.length - 1; // Subtract header and newline
  }
  
  // Calculate average row size and header size
  const avgRowSize = sampleSize > 0 ? totalSize / sampleSize : 100;
  const headerSize = headerRow.length + 1; // +1 for newline
  
  logger.log(`Average row size: ${avgRowSize} chars, Header size: ${headerSize} chars`);
  
  // Calculate optimal rows per chunk to approach target chunk size
  // Accounting for header size and average row size
  const rowsPerChunk = Math.max(1, Math.floor((chunkSize - headerSize) / avgRowSize));
  
  logger.log(`Chunking CSV with ${data.length} rows into chunks of ~${rowsPerChunk} rows (target: ~${chunkSize} chars)`);
  
  // Split data into chunks
  const chunks: string[] = [];
  
  // Split data into chunks based on the calculated optimal rows per chunk
  for (let i = 0; i < data.length; i += rowsPerChunk) {
    const chunkData = data.slice(i, i + rowsPerChunk);
    
    // Convert chunk back to CSV string with headers
    const csvString = Papa.unparse({
      fields: headers,
      data: chunkData
    });
    
    chunks.push(csvString);
    logger.log(`Created chunk ${chunks.length} with ${chunkData.length} rows, approximately ${csvString.length} chars`);
  }
  
  return chunks;
}

/**
 * Creates metadata for CSV chunks processed by Papa Parse
 * @param parsedResult The original parsed CSV data
 * @param chunks The chunked CSV strings
 * @param documentId Document identifier
 * @returns Array of chunks with enhanced metadata
 */
export function createParsedCSVChunkMetadata(
  parsedResult: any,
  chunks: string[],
  documentId: string
): Array<{ text: string; metadata: Record<string, any> }> {
  const { meta } = parsedResult;
  const headers = meta.fields || [];
  
  return chunks.map((chunk, index) => {
    // Parse this chunk to count rows (subtract 1 for header)
    const chunkData = Papa.parse(chunk, { header: true });
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
