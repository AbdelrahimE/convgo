/**
 * CSV-specific processing utilities to improve handling of tabular data
 * This module provides specialized handling for CSV files in the text extraction process
 */

// Create a simple logger since we can't use @/utils/logger in edge functions
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

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
    mimeType.includes('text/comma-separated-values')
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
 * Split CSV text into fields, properly handling quoted fields that contain commas
 * @param line A line of CSV text
 * @returns Array of field values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      // Handle escaped quotes
      if (i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++; // Skip the next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add the last field
  result.push(current);
  
  return result;
}

/**
 * Improved function to identify product groups in e-commerce CSV data
 * Groups products based on shared attributes like base product name and categories
 * @param rows Array of CSV rows (excluding header)
 * @param headerRow The header row to determine column indices
 * @returns Array of product groups with their row indices
 */
function identifyProductGroups(rows: string[], headerRow: string): number[][] {
  if (rows.length === 0) return [];
  
  // Parse the header to find key columns
  const headers = parseCSVLine(headerRow);
  const nameColIdx = headers.findIndex(h => 
    /name|product|title/i.test(h.toLowerCase())
  );
  const catColIdx = headers.findIndex(h => 
    /categor|type|group/i.test(h.toLowerCase())
  );
  const descColIdx = headers.findIndex(h => 
    /desc|detail|info/i.test(h.toLowerCase())
  );
  
  // Use name column or default to first column if not found
  const productNameColIdx = nameColIdx >= 0 ? nameColIdx : 0;
  
  const productGroups: number[][] = [];
  let currentGroup: number[] = [0]; // Start with first row
  let currentBaseProduct = '';
  let currentCategory = '';
  
  // Helper to extract clean product name from a row, handling quoted fields properly
  const getProductBaseNameAndCategory = (row: string): [string, string] => {
    const fields = parseCSVLine(row);
    
    // Get base product name (remove size/color variations)
    let productName = productNameColIdx < fields.length ? fields[productNameColIdx] : '';
    productName = productName.replace(/\s+-\s+\w+(\s*,.*)?$/i, '').trim();
    
    // If product name contains size/color pattern, extract the base name
    const sizeColorMatch = productName.match(/^(.+?)(?:\s+-\s+(?:Small|Medium|Large|XL|XXL|\d+x\d+|Blue|Red|Green|Yellow|Black|White))/i);
    if (sizeColorMatch) {
      productName = sizeColorMatch[1].trim();
    }
    
    // Get category if available
    const category = catColIdx >= 0 && catColIdx < fields.length ? fields[catColIdx] : '';
    
    return [productName, category];
  };
  
  // Initialize with first row's product and category
  [currentBaseProduct, currentCategory] = getProductBaseNameAndCategory(rows[0]);
  
  // Group rows by similar product names and categories
  for (let i = 1; i < rows.length; i++) {
    const [productName, category] = getProductBaseNameAndCategory(rows[i]);
    
    // Check if this row belongs to the same product group
    let isSameProduct = false;
    
    // Check if names are very similar (either exact match or contains each other)
    const namesSimilar = productName === currentBaseProduct || 
                         productName.includes(currentBaseProduct) || 
                         currentBaseProduct.includes(productName);
    
    // Check if categories match (if we have category data)
    const categoriesMatch = !category || !currentCategory || category === currentCategory;
    
    // Check for variant patterns that indicate same product family
    const hasVariantPattern = rows[i].match(/\b(Small|Medium|Large|XL|XXL|\d+x\d+|Blue|Red|Green|Yellow|Black|White)\b/i);
    
    // Check for description continuation (incomplete sentence from previous row)
    const incompleteDescription = descColIdx >= 0 && i > 0 && rows[i-1].length > 0 && !rows[i-1].match(/[.!?][\s"']*$/);
    
    // Consider same product if name is similar or has variant pattern, and categories match
    isSameProduct = (namesSimilar || hasVariantPattern || incompleteDescription) && categoriesMatch;
    
    if (isSameProduct) {
      currentGroup.push(i);
    } else {
      // Start a new product group
      if (currentGroup.length > 0) {
        productGroups.push([...currentGroup]);
      }
      currentGroup = [i];
      [currentBaseProduct, currentCategory] = [productName, category];
    }
  }
  
  // Add the last group if not empty
  if (currentGroup.length > 0) {
    productGroups.push(currentGroup);
  }
  
  return productGroups;
}

/**
 * Completely revised function to process CSV text into semantic chunks
 * that preserve product integrity without breaking rows or products
 * Now ensures header row is included in every chunk
 * @param csvText The CSV text content
 * @param chunkSize Target chunk size guideline (will be exceeded to preserve products)
 * @param ensureHeaderInChunks Whether to include the header row in each chunk
 * @returns Array of chunks with preserved CSV structure
 */
export function chunkCSVContent(
  csvText: string, 
  chunkSize: number,
  ensureHeaderInChunks: boolean = true // Default to true
): string[] {
  if (!csvText || csvText.trim().length === 0) return [];
  
  // Split content into lines, preserving non-empty lines
  const lines = csvText.split('\n').filter(line => line.trim().length > 0);
  if (lines.length < 2) return [csvText]; // If very small, return as is
  
  // Extract header row for later inclusion in each chunk
  const headerRow = lines[0];
  const dataRows = lines.slice(1); // All rows except header
  
  logger.log(`Processing CSV with ${dataRows.length} data rows. Include headers: ${ensureHeaderInChunks}`);
  
  // Initialize result array
  const chunks: string[] = [];
  
  // Group products to keep related items together
  const productGroups = identifyProductGroups(dataRows, headerRow);
  
  logger.log(`Identified ${productGroups.length} product groups`);
  
  // If we couldn't identify product groups, use a more conservative approach
  if (productGroups.length === 0) {
    logger.log('No product groups identified, using fallback chunking');
    return fallbackCSVChunking(csvText, headerRow, dataRows, chunkSize, ensureHeaderInChunks);
  }
  
  // Process each product group, ensuring we NEVER split a product group
  // Initialize with header row if specified
  let currentChunkRows: string[] = ensureHeaderInChunks ? [headerRow] : [];
  let currentEstimatedSize = ensureHeaderInChunks ? headerRow.length + 1 : 0;
  
  logger.log(`Initialize chunking with ensureHeaderInChunks=${ensureHeaderInChunks}, currentChunkRows length=${currentChunkRows.length}`);
  
  for (let groupIdx = 0; groupIdx < productGroups.length; groupIdx++) {
    const group = productGroups[groupIdx];
    const groupRows = group.map(idx => dataRows[idx]);
    
    // Calculate size of this entire product group (including newlines)
    const groupSize = groupRows.reduce((sum, row) => sum + row.length + 1, 0);
    
    // If adding this group would exceed the target chunk size AND we already have content,
    // finish the current chunk and start a new one
    if (currentEstimatedSize + groupSize > chunkSize * 2 && currentChunkRows.length > (ensureHeaderInChunks ? 1 : 0)) {
      // Finalize the current chunk - Just join the rows, header is already included
      chunks.push(currentChunkRows.join('\n'));
      
      // Reset for next chunk with the header if needed
      currentChunkRows = ensureHeaderInChunks ? [headerRow] : [];
      currentEstimatedSize = ensureHeaderInChunks ? headerRow.length + 1 : 0;
      
      logger.log(`Added chunk ${chunks.length} with header: ${ensureHeaderInChunks}, currentChunkRows length now ${currentChunkRows.length}`);
    }
    
    // Add all rows from this product group to the current chunk
    // We NEVER split a product group even if it exceeds the chunk size
    groupRows.forEach(row => {
      currentChunkRows.push(row);
      currentEstimatedSize += row.length + 1;
    });
    
    // If current chunk is getting very large, complete it
    // This is a safety check to prevent extremely large chunks
    if (currentEstimatedSize > chunkSize * 3 && groupIdx < productGroups.length - 1) {
      // Finalize this chunk - Just join the rows, header is already included
      chunks.push(currentChunkRows.join('\n'));
      
      // Reset for next chunk with the header if needed
      currentChunkRows = ensureHeaderInChunks ? [headerRow] : [];
      currentEstimatedSize = ensureHeaderInChunks ? headerRow.length + 1 : 0;
      
      logger.log(`Added large chunk ${chunks.length} with header: ${ensureHeaderInChunks}, currentChunkRows length now ${currentChunkRows.length}`);
    }
  }
  
  // Add the last chunk if it has content
  if (currentChunkRows.length > (ensureHeaderInChunks ? 1 : 0)) {
    // Finalize this chunk - Just join the rows, header is already included
    chunks.push(currentChunkRows.join('\n'));
    logger.log(`Added final chunk ${chunks.length} with header: ${ensureHeaderInChunks}`);
  }
  
  // Keep all the validation checks as safety nets
  validateAndFixHeaders(chunks, headerRow, ensureHeaderInChunks);
  
  logger.log(`Created ${chunks.length} chunks from ${productGroups.length} product groups`);
  
  return chunks;
}

/**
 * Helper function to validate and fix headers across all chunks
 */
function validateAndFixHeaders(chunks: string[], headerRow: string, ensureHeaderInChunks: boolean): void {
  if (!ensureHeaderInChunks || chunks.length === 0) return;
  
  // Verify each chunk starts with the header row
  for (let i = 0; i < chunks.length; i++) {
    if (!chunks[i].startsWith(headerRow)) {
      logger.log(`Fixing missing header in chunk ${i}`);
      chunks[i] = headerRow + '\n' + chunks[i];
    }
    
    // More thorough validation - check exact header match
    const chunkLines = chunks[i].split('\n');
    if (chunkLines[0] !== headerRow) {
      logger.log(`Header mismatch in chunk ${i}, fixing...`);
      // Remove any incorrect header and add the correct one
      const dataLinesOnly = chunkLines[0] === headerRow ? chunkLines.slice(1) : chunkLines;
      chunks[i] = headerRow + '\n' + dataLinesOnly.join('\n');
    }
  }
  
  // Log validation results
  logger.log(`Validated ${chunks.length} chunks, all now have headers`);
}

/**
 * Fallback chunking method when product groups cannot be identified
 * More conservative approach that preserves row integrity
 * Now ensures header row is included in every chunk
 */
function fallbackCSVChunking(
  csvText: string, 
  headerRow: string, 
  dataRows: string[], 
  chunkSize: number,
  ensureHeaderInChunks: boolean = true // Default to true
): string[] {
  const chunks: string[] = [];
  let currentChunkRows: string[] = ensureHeaderInChunks ? [headerRow] : [];
  let currentSize = ensureHeaderInChunks ? headerRow.length + 1 : 0;
  
  // Log the start of fallback chunking for debugging
  logger.log(`Starting fallback CSV chunking with ensureHeaderInChunks=${ensureHeaderInChunks}`);
  
  // Conservatively group rows until we approach chunk size
  for (const row of dataRows) {
    const rowSize = row.length + 1; // +1 for newline
    
    // If adding this row would exceed chunk size and we have content,
    // start a new chunk - but always keep rows intact
    if (currentSize + rowSize > chunkSize * 1.5 && currentChunkRows.length > (ensureHeaderInChunks ? 1 : 0)) {
      // Finalize this chunk - Just join the rows, header is already included
      chunks.push(currentChunkRows.join('\n'));
      
      // Reset for next chunk with the header if needed
      currentChunkRows = ensureHeaderInChunks ? [headerRow] : [];
      currentSize = ensureHeaderInChunks ? headerRow.length + 1 : 0;
      
      logger.log(`Added fallback chunk ${chunks.length} with header: ${ensureHeaderInChunks}, currentChunkRows length now ${currentChunkRows.length}`);
    }
    
    // Add the row to current chunk
    currentChunkRows.push(row);
    currentSize += rowSize;
  }
  
  // Add the last chunk if not empty
  if (currentChunkRows.length > (ensureHeaderInChunks ? 1 : 0)) {
    // Finalize this chunk - Just join the rows, header is already included
    chunks.push(currentChunkRows.join('\n'));
    logger.log(`Added final fallback chunk ${chunks.length} with header: ${ensureHeaderInChunks}`);
  }
  
  // Use the same validation helper function
  validateAndFixHeaders(chunks, headerRow, ensureHeaderInChunks);
  
  logger.log(`Fallback chunking created ${chunks.length} chunks with headers=${ensureHeaderInChunks}`);
  
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
  const headers = parseCSVLine(headerRow).map(h => h.trim());
  
  return chunks.map((chunk, index) => {
    // Count rows in this chunk (subtract 1 for header)
    const chunkLines = chunk.split('\n');
    const rowCount = chunkLines.length - 1;
    
    // Determine which part of the full dataset this chunk represents
    const totalRows = csvText.split('\n').filter(line => line.trim().length > 0).length - 1;
    const startPercent = Math.floor((index / chunks.length) * 100);
    const endPercent = Math.floor(((index + 1) / chunks.length) * 100);
    
    // For csv, position in original document is less useful, so we calculate percentage instead
    const dataRows = chunkLines.slice(1); // Skip header
    
    // Determine what products are contained in this chunk
    const productNames = new Set<string>();
    const nameColIdx = headers.findIndex(h => 
      /name|product|title/i.test(h.toLowerCase())
    );
    
    // Default to first column if no product name column found
    const productNameColIdx = nameColIdx >= 0 ? nameColIdx : 0;
    
    for (const row of dataRows) {
      const fields = parseCSVLine(row);
      if (fields.length > productNameColIdx) {
        // Clean product name (remove quotes, trim)
        const productName = fields[productNameColIdx].trim();
        
        // Remove size/color variations to get base product name
        const baseProductName = productName.replace(/\s+-\s+(?:Small|Medium|Large|XL|XXL|\d+x\d+|Blue|Red|Green|Yellow|Black|White)/i, '').trim();
        
        if (baseProductName) {
          productNames.add(baseProductName);
        }
      }
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
