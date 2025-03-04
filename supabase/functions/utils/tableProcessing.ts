/**
 * Table detection and processing utilities for better text extraction
 */

/**
 * Checks if a text segment appears to be a table based on structure patterns
 * @param text Text segment to analyze
 * @returns Boolean indicating whether this is likely a table
 */
export function isTableContent(text: string): boolean {
  // Count the number of consecutive lines that have similar patterns of
  // delimiters like commas, tabs, or multiple spaces
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  if (lines.length < 3) return false;
  
  // Check for consistent separators like tabs, multiple spaces, or vertical bars
  const delimiters = [/\t/, /\s{2,}/, /\|/, /:/, /،/];
  let consistentFormat = false;
  
  for (const delimiter of delimiters) {
    // Count delimiters in each line
    const delimiterCounts = lines.map(line => (line.match(delimiter) || []).length);
    
    // Check if at least 3 consecutive lines have similar delimiter counts
    let similarFormatCount = 0;
    for (let i = 1; i < delimiterCounts.length; i++) {
      if (Math.abs(delimiterCounts[i] - delimiterCounts[i-1]) <= 1 && delimiterCounts[i] > 0) {
        similarFormatCount++;
        if (similarFormatCount >= 2) {
          consistentFormat = true;
          break;
        }
      } else {
        similarFormatCount = 0;
      }
    }
    
    if (consistentFormat) break;
  }
  
  // Check for content that has number patterns typical in tables
  const numberPatterns = lines.map(line => (line.match(/\d+(\.\d+)?/) || []).length);
  const hasConsistentNumbers = numberPatterns.filter(count => count > 0).length >= Math.floor(lines.length * 0.5);
  
  // Check for data patterns common in tables (phone numbers, emails, etc.)
  const dataPatterns = [
    /(\+?\d{1,4}[\s-]?)?(\(?\d{1,4}\)?[\s-]?)?\d{3}[\s-]?\d{3}[\s-]?\d{4}/, // Phone numbers
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, // Emails
    /\d{5,}/, // ID numbers or postal codes
  ];
  
  let hasDataPatterns = false;
  for (const pattern of dataPatterns) {
    const matchCount = lines.filter(line => pattern.test(line)).length;
    if (matchCount >= 2) {
      hasDataPatterns = true;
      break;
    }
  }
  
  return consistentFormat || hasConsistentNumbers || hasDataPatterns;
}

/**
 * Identifies the start and end indices of table sections within a text
 * @param text Full text content to analyze
 * @returns Array of [start, end] index pairs for each table section
 */
export function findTableSections(text: string): [number, number][] {
  if (!text) return [];
  
  const tableSections: [number, number][] = [];
  const lines = text.split('\n');
  let currentPos = 0;
  
  let inTable = false;
  let tableStartPos = 0;
  let tableBuffer = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for table start
    if (!inTable && i < lines.length - 2) {
      // Look ahead to see if we're entering table content
      const potentialTable = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');
      if (isTableContent(potentialTable)) {
        inTable = true;
        tableStartPos = currentPos;
        tableBuffer = '';
      }
    }
    
    if (inTable) {
      tableBuffer += line + '\n';
      
      // Check if table section ends
      // Tables typically end with empty lines or a clear transition to non-tabular format
      if (i === lines.length - 1 || 
          (i < lines.length - 1 && lines[i+1].trim() === '' && i < lines.length - 2 && lines[i+2].trim() === '') ||
          (i < lines.length - 3 && !isTableContent(lines.slice(i-2, i+3).join('\n')))) {
        inTable = false;
        // Add boundary at end of table
        tableSections.push([tableStartPos, currentPos + line.length]);
      }
    }
    
    currentPos += line.length + 1; // +1 for newline
  }
  
  // If we're still in a table at the end of the text, close it
  if (inTable) {
    tableSections.push([tableStartPos, currentPos]);
  }
  
  return tableSections;
}

/**
 * Improves table formatting for better readability and structure
 * @param tableText The extracted table text
 * @returns Formatted table text
 */
export function formatTableText(tableText: string): string {
  if (!tableText || !isTableContent(tableText)) return tableText;
  
  const lines = tableText.split('\n').filter(line => line.trim().length > 0);
  
  // Try to detect column structure
  const formattedLines = lines.map(line => {
    // Replace multiple spaces with a consistent delimiter
    const formattedLine = line
      .replace(/\s{2,}/g, ' | ')   // Replace multiple spaces with pipe delimiter
      .replace(/(\|)\s*(\|)/g, '|') // Clean up multiple adjacent delimiters
      .trim();
    
    return formattedLine;
  });
  
  return formattedLines.join('\n');
}

/**
 * Process text that has been identified as a table, ensuring it remains intact
 * during chunking operations
 * @param tableText The table text to process
 * @param maxChunkSize Maximum size for chunking
 * @returns Array of table chunks that maintain row integrity
 */
export function processTableForChunking(tableText: string, maxChunkSize: number): string[] {
  if (!tableText || !isTableContent(tableText)) return [tableText];
  
  // If table is smaller than max size, keep it intact
  if (tableText.length <= maxChunkSize) {
    return [formatTableText(tableText)];
  }
  
  // Otherwise, we need to split the table while preserving row integrity
  const rows = tableText.split('\n').filter(row => row.trim().length > 0);
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentSize = 0;
  
  // Add header rows (typically first 1-2 rows) to each chunk if we can identify them
  const headerRows: string[] = [];
  
  // Attempt to identify header rows - usually first row or rows with distinct formatting
  if (rows.length >= 2) {
    // Check if first row is shorter (likely a title)
    if (rows[0].length < rows[1].length * 0.8) {
      headerRows.push(rows[0]);
      
      // Second row might also be a header
      if (rows.length >= 3 && 
          (rows[1].includes('---') || rows[1].includes('===') || 
           rows[1].includes('***') || /^[\s\-_=*]+$/.test(rows[1]))) {
        headerRows.push(rows[1]);
      }
    } else {
      // First row is probably the header
      headerRows.push(rows[0]);
    }
  } else if (rows.length > 0) {
    headerRows.push(rows[0]);
  }
  
  // Process row by row, keeping rows intact
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    // Skip header rows in main loop as we'll add them to each chunk
    if (headerRows.includes(row) && i < headerRows.length) continue;
    
    // If adding this row would exceed chunk size, start a new chunk
    if (currentSize + row.length + 1 > maxChunkSize && currentChunk.length > 0) {
      chunks.push(formatTableText(currentChunk.join('\n')));
      currentChunk = [...headerRows]; // Start new chunk with headers
      currentSize = headerRows.reduce((sum, row) => sum + row.length + 1, 0);
    }
    
    currentChunk.push(row);
    currentSize += row.length + 1; // +1 for newline
  }
  
  // Add the last chunk if there's anything left
  if (currentChunk.length > 0) {
    chunks.push(formatTableText(currentChunk.join('\n')));
  }
  
  return chunks;
}
