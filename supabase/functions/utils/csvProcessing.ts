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
 * Identifies product groups in e-commerce CSV data
 * Groups products based on shared attributes like base product name
 * @param rows Array of CSV rows (excluding header)
 * @returns Array of product groups with their row indices
 */
function identifyProductGroups(rows: string[]): number[][] {
  if (rows.length === 0) return [];
  
  const productGroups: number[][] = [];
  let currentGroup: number[] = [0]; // Start with first row
  
  // Helper to extract potential product base name from a row
  const extractBaseProductName = (row: string): string => {
    const cells = row.split(',');
    // First column usually contains product name or SKU
    let baseName = cells[0] || '';
    
    // Remove size/color variations like "- Small", "- Blue", etc.
    baseName = baseName.replace(/\s+-\s+\w+(\s*,.*)?$/i, '');
    
    // Clean up quoted strings
    return baseName.replace(/^["'](.*)["']$/, '$1').trim();
  };
  
  const baseProductName = extractBaseProductName(rows[0]);
  
  // Group products with similar names
  for (let i = 1; i < rows.length; i++) {
    const currentRowProductName = extractBaseProductName(rows[i]);
    
    // Check if this row is part of the same product group
    // Consider it same group if names are similar or previous row doesn't end with period
    // (indicating incomplete description)
    const previousRow = rows[i-1];
    const previousRowEndsWithPeriod = /[.!?][\s"']*$/.test(previousRow);
    const isSameProduct = currentRowProductName === baseProductName || 
                          !previousRowEndsWithPeriod ||
                          // Check for size/variant pattern (common in e-commerce CSVs)
                          rows[i].match(/\b(Small|Medium|Large|XL|XXL|\d+x\d+|Blue|Red|Green|Yellow|Black|White)\b/i);
    
    if (isSameProduct) {
      currentGroup.push(i);
    } else {
      // Start a new product group
      productGroups.push([...currentGroup]);
      currentGroup = [i];
    }
  }
  
  // Add the last group if not empty
  if (currentGroup.length > 0) {
    productGroups.push(currentGroup);
  }
  
  return productGroups;
}

/**
 * Improved function to process CSV text into semantic chunks while preserving
 * product integrity and maintaining context between related products
 * @param csvText The CSV text content
 * @param chunkSize Maximum desired chunk size
 * @returns Array of chunks with preserved CSV structure
 */
export function chunkCSVContent(csvText: string, chunkSize: number): string[] {
  if (!csvText || csvText.trim().length === 0) return [];
  
  // Split content into lines, preserving non-empty lines
  const lines = csvText.split('\n').filter(line => line.trim().length > 0);
  if (lines.length < 2) return [csvText]; // If very small, return as is
  
  // Extract header row for later inclusion in each chunk
  const headerRow = extractCSVHeader(csvText);
  const dataRows = lines.slice(1); // All rows except header
  
  // Initialize result array
  const chunks: string[] = [];
  
  // Group products to keep related items together
  const productGroups = identifyProductGroups(dataRows);
  
  // If we couldn't identify distinct product groups, fall back to simpler chunking
  if (productGroups.length === 0) {
    // Build chunks of rows ensuring no row is split
    let currentChunk: string[] = [headerRow];
    let currentSize = headerRow.length + 1; // +1 for newline
    
    for (const row of dataRows) {
      const rowSize = row.length + 1; // +1 for newline
      
      // If adding this row would exceed chunk size and we have more than just the header,
      // start a new chunk
      if (currentSize + rowSize > chunkSize && currentChunk.length > 1) {
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
  
  // Process each product group while respecting chunk size limits
  let currentChunk: string[] = [headerRow];
  let currentSize = headerRow.length + 1; // +1 for newline
  
  for (const group of productGroups) {
    // Calculate size of this entire product group
    const groupRows = group.map(idx => dataRows[idx]);
    const groupSize = groupRows.reduce((sum, row) => sum + row.length + 1, 0); // +1 for each newline
    
    // If this group alone exceeds chunk size, we need to split it
    // But we'll still try to keep as much together as possible
    if (groupSize > chunkSize) {
      // If current chunk has content beyond header, save it first
      if (currentChunk.length > 1) {
        chunks.push(currentChunk.join('\n'));
        currentChunk = [headerRow];
        currentSize = headerRow.length + 1;
      }
      
      // Add as many rows from this group as possible
      for (const rowIdx of group) {
        const row = dataRows[rowIdx];
        
        if (currentSize + row.length + 1 > chunkSize && currentChunk.length > 1) {
          chunks.push(currentChunk.join('\n'));
          currentChunk = [headerRow];
          currentSize = headerRow.length + 1;
        }
        
        currentChunk.push(row);
        currentSize += row.length + 1;
      }
    } 
    // If this group fits in current chunk, add it
    else if (currentSize + groupSize <= chunkSize) {
      for (const rowIdx of group) {
        currentChunk.push(dataRows[rowIdx]);
      }
      currentSize += groupSize;
    } 
    // If group doesn't fit in current chunk but can be its own chunk
    else {
      // Save current chunk if it has content
      if (currentChunk.length > 1) {
        chunks.push(currentChunk.join('\n'));
      }
      
      // Start fresh chunk with this group
      currentChunk = [headerRow, ...group.map(idx => dataRows[idx])];
      currentSize = headerRow.length + 1 + groupSize;
    }
  }
  
  // Add the last chunk if it has content beyond just the header
  if (currentChunk.length > 1) {
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
    // This is trickier with our new chunking approach, as chunks may contain
    // non-consecutive rows from the original CSV
    const chunkWithoutHeader = chunk.split('\n').slice(1).join('\n');
    const position = csvText.indexOf(chunkWithoutHeader);
    
    // Determine what products are contained in this chunk
    const productNames = new Set<string>();
    const chunkRows = chunk.split('\n').slice(1); // Skip header
    
    for (const row of chunkRows) {
      const cells = row.split(',');
      if (cells.length > 0 && cells[0]) {
        // Clean product name (remove quotes, trim)
        const productName = cells[0].replace(/^["'](.*)["']$/, '$1').trim();
        // Remove variation details to get base product name
        const baseProductName = productName.replace(/\s+-\s+\w+(\s*,.*)?$/i, '');
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
        position: position >= 0 ? position : undefined,
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
