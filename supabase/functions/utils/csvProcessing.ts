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
 * @param csvText The CSV text content
 * @param chunkSize Target chunk size guideline (will be exceeded to preserve products)
 * @returns Array of chunks with preserved CSV structure
 */
export function chunkCSVContent(csvText: string, chunkSize: number): string[] {
  if (!csvText || csvText.trim().length === 0) return [];
  
  // Split content into lines, preserving non-empty lines
  const lines = csvText.split('\n').filter(line => line.trim().length > 0);
  if (lines.length < 2) return [csvText]; // If very small, return as is
  
  // Extract header row for later inclusion in each chunk
  const headerRow = lines[0];
  const dataRows = lines.slice(1); // All rows except header
  
  console.log(`Processing CSV with ${dataRows.length} data rows`);
  
  // Initialize result array
  const chunks: string[] = [];
  
  // Group products to keep related items together
  const productGroups = identifyProductGroups(dataRows, headerRow);
  
  console.log(`Identified ${productGroups.length} product groups`);
  
  // If we couldn't identify product groups, use a more conservative approach
  if (productGroups.length === 0) {
    console.log('No product groups identified, using fallback chunking');
    return fallbackCSVChunking(csvText, headerRow, dataRows, chunkSize);
  }
  
  // Process each product group, ensuring we NEVER split a product group
  let currentChunkRows: string[] = [headerRow];
  let currentEstimatedSize = headerRow.length + 1; // +1 for newline
  
  for (let groupIdx = 0; groupIdx < productGroups.length; groupIdx++) {
    const group = productGroups[groupIdx];
    const groupRows = group.map(idx => dataRows[idx]);
    
    // Calculate size of this entire product group (including newlines)
    const groupSize = groupRows.reduce((sum, row) => sum + row.length + 1, 0);
    
    // If adding this group would exceed the target chunk size AND we already have content,
    // finish the current chunk and start a new one
    if (currentEstimatedSize + groupSize > chunkSize * 2 && currentChunkRows.length > 1) {
      chunks.push(currentChunkRows.join('\n'));
      currentChunkRows = [headerRow]; // Start new chunk with header
      currentEstimatedSize = headerRow.length + 1;
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
      chunks.push(currentChunkRows.join('\n'));
      currentChunkRows = [headerRow];
      currentEstimatedSize = headerRow.length + 1;
    }
  }
  
  // Add the last chunk if it has content beyond just the header
  if (currentChunkRows.length > 1) {
    chunks.push(currentChunkRows.join('\n'));
  }
  
  console.log(`Created ${chunks.length} chunks from ${productGroups.length} product groups`);
  
  return chunks;
}

/**
 * Fallback chunking method when product groups cannot be identified
 * More conservative approach that preserves row integrity
 */
function fallbackCSVChunking(
  csvText: string, 
  headerRow: string, 
  dataRows: string[], 
  chunkSize: number
): string[] {
  const chunks: string[] = [];
  let currentChunk: string[] = [headerRow];
  let currentSize = headerRow.length + 1; // +1 for newline
  
  // Conservatively group rows until we approach chunk size
  for (const row of dataRows) {
    const rowSize = row.length + 1; // +1 for newline
    
    // If adding this row would exceed chunk size and we have more than just the header,
    // start a new chunk - but always keep rows intact
    if (currentSize + rowSize > chunkSize * 1.5 && currentChunk.length > 1) {
      chunks.push(currentChunk.join('\n'));
      currentChunk = [headerRow];
      currentSize = headerRow.length + 1;
    }
    
    // Add the row to current chunk
    currentChunk.push(row);
    currentSize += rowSize;
  }
  
  // Add the last chunk if not empty
  if (currentChunk.length > 1) { // > 1 to ensure we have more than just the header
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
        let productName = fields[productNameColIdx].trim();
        
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
