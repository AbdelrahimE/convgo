import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { findTableSections, processTableForChunking, isTableContent } from '../utils/tableProcessing.ts';
import { isCSVContent, chunkCSVContent, createCSVChunkMetadata } from '../utils/csvProcessing.ts';
import { parseCSVContent, chunkParsedCSV, createParsedCSVChunkMetadata } from '../utils/csvParseProcessing.ts';

// Create a simple logger since we can't use @/utils/logger in edge functions
const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  debug: (...args: any[]) => console.debug(...args),
};

// Text processing utilities
interface ChunkingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  splitBySentence?: boolean;
  structureAware?: boolean;
  preserveTables?: boolean;
  cleanRedundantData?: boolean;
}

// Default chunking options matching the frontend
const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
  chunkSize: 1024, // Updated to 1024 to match frontend defaults and better handle product data
  chunkOverlap: 120, // Updated to match frontend
  splitBySentence: true,
  structureAware: true,
  preserveTables: true,
  cleanRedundantData: true
};

/**
 * Detects the language of a text chunk
 * Simple implementation based on character frequency and patterns
 */
function detectChunkLanguage(text: string): string {
  if (!text || text.trim().length === 0) {
    return 'unknown';
  }
  
  // Sample of common characters in various scripts
  const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  const cyrillicPattern = /[\u0400-\u04FF]/;
  const hanPattern = /[\u4E00-\u9FFF]/;
  const devanagariPattern = /[\u0900-\u097F]/;
  const thaiPattern = /[\u0E00-\u0E7F]/;
  const hebrewPattern = /[\u0590-\u05FF]/;
  
  // Check for script patterns
  const arabicCount = (text.match(arabicPattern) || []).length;
  const cyrillicCount = (text.match(cyrillicPattern) || []).length;
  const hanCount = (text.match(hanPattern) || []).length;
  const devanagariCount = (text.match(devanagariPattern) || []).length;
  const thaiCount = (text.match(thaiPattern) || []).length;
  const hebrewCount = (text.match(hebrewPattern) || []).length;
  
  // Count Latin script (basic English/European languages)
  const latinCount = (text.match(/[a-zA-Z]/) || []).length;
  
  // Determine primary script based on character count
  const counts = [
    { script: 'ar', count: arabicCount },
    { script: 'ru', count: cyrillicCount },
    { script: 'zh', count: hanCount },
    { script: 'hi', count: devanagariCount },
    { script: 'th', count: thaiCount },
    { script: 'he', count: hebrewCount },
    { script: 'en', count: latinCount }
  ];
  
  // Sort by count in descending order
  counts.sort((a, b) => b.count - a.count);
  
  // If the highest count is 0, we couldn't detect a specific script
  if (counts[0].count === 0) {
    return 'unknown';
  }
  
  // Return the language code of the most frequent script
  return counts[0].script;
}

/**
 * Determines text direction based on detected language
 */
function getTextDirection(language: string): string {
  // RTL languages
  const rtlLanguages = ['ar', 'he', 'ur', 'fa', 'ps'];
  
  if (rtlLanguages.includes(language)) {
    return 'rtl';
  }
  
  return 'ltr';
}

/**
 * Detects if a text segment appears to be a table
 */
function isTableContent(text: string): boolean {
  // Count the number of consecutive lines that have similar patterns of
  // delimiters like commas, tabs, or multiple spaces
  const lines = text.split('\n');
  if (lines.length < 3) return false;
  
  // Check for consistent separators like tabs, multiple spaces, or vertical bars
  const delimiters = [/\t/, /\s{2,}/, /\|/];
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
  
  // Also check for content that has number patterns typical in tables
  const numberPatterns = lines.map(line => (line.match(/\d+(\.\d+)?/) || []).length);
  const hasConsistentNumbers = numberPatterns.filter(count => count > 0).length >= Math.floor(lines.length * 0.5);
  
  // Check for phone numbers, which often appear in tables
  const phonePattern = /(\+?\d{1,4}[\s-]?)?(\(?\d{1,4}\)?[\s-]?)?\d{3}[\s-]?\d{3}[\s-]?\d{4}/;
  const hasPhoneNumbers = lines.filter(line => phonePattern.test(line)).length >= 2;
  
  return consistentFormat || hasConsistentNumbers || hasPhoneNumbers;
}

/**
 * Enhanced function to detect structural boundaries in text for improved chunking
 */
function findStructuralBoundaries(text: string): number[] {
  if (!text) return [];
  
  const boundaries: number[] = [];
  const lines = text.split('\n');
  let currentPos = 0;
  
  let inTable = false;
  let tableBuffer = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip position calculation for empty lines
    if (!line.trim()) {
      currentPos += line.length + 1; // +1 for newline
      continue;
    }
    
    // Check for section headings
    const isHeading = /^[#\s]*[A-Z\u0600-\u06FF][A-Z\u0600-\u06FF\s]*[:؟؛،-]?\s*$/.test(line) && line.trim().length < 100;
    
    // Check for table start/end - now handled by the dedicated table processing module
    if (!inTable && i < lines.length - 2) {
      // Look ahead to see if we're entering table content
      const potentialTable = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');
      if (isTableContent(potentialTable)) {
        inTable = true;
        tableBuffer = '';
        
        // Add boundary at the start of table 
        boundaries.push(currentPos);
      }
    }
    
    if (inTable) {
      tableBuffer += line + '\n';
      
      // Check if table section ends
      if (i === lines.length - 1 || 
          (i < lines.length - 1 && lines[i+1].trim() === '' && i < lines.length - 2 && lines[i+2].trim() === '')) {
        inTable = false;
        // Add boundary at end of table
        boundaries.push(currentPos + line.length);
      }
    } else if (isHeading) {
      // Add boundary before heading
      boundaries.push(currentPos);
    } else if (line.trim().endsWith('.') || line.trim().endsWith('؟') || line.trim().endsWith('!')) {
      // End of paragraph or complete sentence - potential boundary
      boundaries.push(currentPos + line.length);
    }
    
    currentPos += line.length + 1; // +1 for newline
  }
  
  return boundaries;
}

/**
 * Clean redundant data from text to improve quality
 */
function cleanRedundantData(text: string): string {
  if (!text) return '';
  
  // 1. Clean repeated contact information
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const phonePattern = /(\+?\d{1,4}[\s-]?)?(\(?\d{1,4}\)?[\s-]?)?\d{3}[\s-]?\d{3}[\s-]?\d{4}/g;
  const addressPattern = /([A-Za-z\u0600-\u06FF]+\s){2,}(\d+),\s([A-Za-z\u0600-\u06FF]+\s?)+,\s([A-Za-z\u0600-\u06FF]+\s?)+/g;
  
  // Extract all occurrences of patterns
  const emails = text.match(emailPattern) || [];
  const phones = text.match(phonePattern) || [];
  const addresses = text.match(addressPattern) || [];
  
  // Keep track of seen items to remove duplicates
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();
  const seenAddresses = new Set<string>();
  
  // Replace repeated occurrences with empty string
  let cleanedText = text;
  
  // Clean duplicate emails
  for (const email of emails) {
    if (seenEmails.has(email)) {
      // Skip the first occurrence (already added to set)
      const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const emailRegex = new RegExp(`${escapedEmail}`, 'g');
      let found = false;
      cleanedText = cleanedText.replace(emailRegex, (match) => {
        if (!found) {
          found = true;
          return match; // Keep the first occurrence
        }
        return ''; // Remove duplicates
      });
    } else {
      seenEmails.add(email);
    }
  }
  
  // Clean duplicate phone numbers (similar approach)
  for (const phone of phones) {
    if (seenPhones.has(phone)) {
      const escapedPhone = phone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const phoneRegex = new RegExp(`${escapedPhone}`, 'g');
      let found = false;
      cleanedText = cleanedText.replace(phoneRegex, (match) => {
        if (!found) {
          found = true;
          return match;
        }
        return '';
      });
    } else {
      seenPhones.add(phone);
    }
  }
  
  // Clean duplicate addresses (similar approach)
  for (const address of addresses) {
    if (seenAddresses.has(address)) {
      const escapedAddress = address.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const addressRegex = new RegExp(`${escapedAddress}`, 'g');
      let found = false;
      cleanedText = cleanedText.replace(addressRegex, (match) => {
        if (!found) {
          found = true;
          return match;
        }
        return '';
      });
    } else {
      seenAddresses.add(address);
    }
  }
  
  // 2. Normalize spaces and line breaks
  cleanedText = cleanedText
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
  
  // 3. Format tables better - add proper spacing
  if (isTableContent(cleanedText)) {
    const lines = cleanedText.split('\n');
    cleanedText = lines.map(line => {
      // Add spaces around delimiter characters
      return line.replace(/(\|)/g, ' $1 ').replace(/\s{3,}/g, '  ');
    }).join('\n');
  }
  
  return cleanedText;
}

/**
 * Enhanced function to split text into chunks suitable for embedding models
 * Now with improved table handling and CSV-specific processing
 */
function chunkText(text: string, options: ChunkingOptions = {}): string[] {
  // Merge provided options with defaults
  const chunkSize = options.chunkSize || DEFAULT_CHUNKING_OPTIONS.chunkSize;
  const chunkOverlap = options.chunkOverlap || DEFAULT_CHUNKING_OPTIONS.chunkOverlap;
  const splitBySentence = options.splitBySentence !== undefined ? options.splitBySentence : DEFAULT_CHUNKING_OPTIONS.splitBySentence;
  const structureAware = options.structureAware !== undefined ? options.structureAware : DEFAULT_CHUNKING_OPTIONS.structureAware;
  const preserveTables = options.preserveTables !== undefined ? options.preserveTables : DEFAULT_CHUNKING_OPTIONS.preserveTables;

  logger.log(`Chunking text with size: ${chunkSize}, overlap: ${chunkOverlap}, preserveTables: ${preserveTables}`);

  // Handle empty text
  if (!text || text.trim() === '') {
    return [];
  }

  // Apply cleaning if requested
  let cleanedText = text;
  if (options.cleanRedundantData) {
    cleanedText = cleanRedundantData(text);
    logger.log('Applied redundant data cleaning');
  }

  // If text is smaller than chunk size, return it as a single chunk
  if (cleanedText.length <= chunkSize) {
    return [cleanedText];
  }
  
  // Check if content is CSV and use specialized handling
  if (isCSVContent(cleanedText)) {
    logger.log('Detected CSV content, using specialized CSV chunking');
    try {
      // Try using Papa Parse for better CSV handling
      const parsedCSV = parseCSVContent(cleanedText);
      const csvChunks = chunkParsedCSV(parsedCSV, chunkSize);
      logger.log(`Created ${csvChunks.length} CSV chunks using Papa Parse with chunk size ${chunkSize}`);
      return csvChunks;
    } catch (error) {
      logger.error('Error using Papa Parse for CSV:', error);
      logger.log('Falling back to regular CSV chunking');
      return chunkCSVContent(cleanedText, chunkSize);
    }
  }

  // Special table-preserving chunking
  if (preserveTables) {
    logger.log('Using table-preserving chunking');
    
    // Find all table sections in the text
    const tableSections = findTableSections(cleanedText);
    
    if (tableSections.length > 0) {
      logger.log(`Found ${tableSections.length} table sections to preserve`);
      
      // Process the text in segments, handling tables specially
      const chunks: string[] = [];
      let lastPos = 0;
      
      for (const [tableStart, tableEnd] of tableSections) {
        // Process text before this table
        if (tableStart > lastPos) {
          const beforeTableText = cleanedText.substring(lastPos, tableStart);
          if (beforeTableText.trim()) {
            // Chunk the non-table text using regular methods
            if (structureAware) {
              const structuralChunks = chunkTextWithStructure(beforeTableText, chunkSize, chunkOverlap);
              chunks.push(...structuralChunks);
            } else if (splitBySentence) {
              const sentenceChunks = chunkTextBySentence(beforeTableText, chunkSize, chunkOverlap);
              chunks.push(...sentenceChunks);
            } else {
              const sizeChunks = splitTextBySize(beforeTableText, chunkSize, chunkOverlap);
              chunks.push(...sizeChunks);
            }
          }
        }
        
        // Process the table as a special element
        const tableText = cleanedText.substring(tableStart, tableEnd);
        const tableChunks = processTableForChunking(tableText, chunkSize);
        chunks.push(...tableChunks);
        
        lastPos = tableEnd;
      }
      
      // Process any text after the last table
      if (lastPos < cleanedText.length) {
        const afterTablesText = cleanedText.substring(lastPos);
        if (afterTablesText.trim()) {
          // Chunk the non-table text using regular methods
          if (structureAware) {
            const structuralChunks = chunkTextWithStructure(afterTablesText, chunkSize, chunkOverlap);
            chunks.push(...structuralChunks);
          } else if (splitBySentence) {
            const sentenceChunks = chunkTextBySentence(afterTablesText, chunkSize, chunkOverlap);
            chunks.push(...sentenceChunks);
          } else {
            const sizeChunks = splitTextBySize(afterTablesText, chunkSize, chunkOverlap);
            chunks.push(...sizeChunks);
          }
        }
      }
      
      return chunks;
    }
  }
  
  // If we're here, either there are no tables or preserveTables is false
  
  // Structure-aware chunking
  if (structureAware) {
    return chunkTextWithStructure(cleanedText, chunkSize, chunkOverlap);
  }
  
  // Sentence-aware chunking
  if (splitBySentence) {
    return chunkTextBySentence(cleanedText, chunkSize, chunkOverlap);
  }
  
  // Simple size-based splitting
  return splitTextBySize(cleanedText, chunkSize, chunkOverlap);
}

/**
 * Helper function for structure-aware chunking
 */
function chunkTextWithStructure(text: string, chunkSize: number, chunkOverlap: number): string[] {
  logger.log('Using structure-aware chunking');
  const structuralBoundaries = findStructuralBoundaries(text);
  
  // If no structural boundaries found, fallback to regular chunking
  if (structuralBoundaries.length === 0) {
    return splitTextBySize(text, chunkSize, chunkOverlap);
  }
  
  // Use structural boundaries to create chunks
  const chunks: string[] = [];
  let startPos = 0;
  let currentChunk = '';
  
  for (let i = 0; i < structuralBoundaries.length; i++) {
    const endPos = structuralBoundaries[i];
    const section = text.substring(startPos, endPos);
    
    // If adding this section exceeds chunk size, save current chunk and start a new one
    if (currentChunk.length + section.length > chunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      
      // Large sections need further splitting
      if (section.length > chunkSize) {
        const subChunks = splitTextBySize(section, chunkSize, chunkOverlap);
        chunks.push(...subChunks);
      } else {
        currentChunk = section;
      }
    } else {
      currentChunk += (currentChunk ? '\n' : '') + section;
    }
    
    startPos = endPos;
  }
  
  // Add remaining text
  if (startPos < text.length) {
    const remainingText = text.substring(startPos);
    
    if (currentChunk.length + remainingText.length > chunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      
      // Split remaining text if needed
      if (remainingText.length > chunkSize) {
        const subChunks = splitTextBySize(remainingText, chunkSize, chunkOverlap);
        chunks.push(...subChunks);
      } else {
        chunks.push(remainingText.trim());
      }
    } else {
      currentChunk += (currentChunk ? '\n' : '') + remainingText;
      chunks.push(currentChunk.trim());
    }
  } else if (currentChunk) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

/**
 * Improved function for sentence-aware chunking
 */
function chunkTextBySentence(text: string, chunkSize: number, chunkOverlap: number): string[] {
  // Enhanced sentence splitting regex that works better with Arabic and English
  // This pattern looks for sentence-ending punctuation followed by optional whitespace
  const sentenceRegex = /[^.!?؟،\n]+[.!?؟،]+\s*|[^.!?؟،\n]+(?=\n|$)/g;
  const sentences = text.match(sentenceRegex) || [text];
  
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;
    
    // If adding this sentence would exceed chunk size, save the current chunk
    if (currentChunk.length + trimmedSentence.length + 1 > chunkSize) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      
      // If the sentence itself is longer than chunk size, split it safely
      if (trimmedSentence.length > chunkSize) {
        const sentenceChunks = splitTextBySize(trimmedSentence, chunkSize, chunkOverlap);
        chunks.push(...sentenceChunks);
        currentChunk = '';
        continue;
      }
      
      // Start a new chunk with this sentence
      currentChunk = trimmedSentence;
    } else {
      // Add sentence to current chunk
      currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
    }
  }
  
  // Add the last chunk if there's anything left
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

/**
 * Finds a safe break point at word boundaries to avoid cutting words in half
 * Works with Arabic, English, and other languages
 * @param text - The text to analyze
 * @param position - The target position to break at
 * @param direction - Whether to search backward or forward from position
 * @param maxDistance - Maximum distance to search for a safe break point
 * @returns The safe break position
 */
function findSafeBreakPoint(
  text: string, 
  position: number, 
  direction: 'backward' | 'forward' = 'backward',
  maxDistance: number = 200
): number {
  // If position is at the start or end, return as is
  if (position <= 0) return 0;
  if (position >= text.length) return text.length;
  
  // Word boundary patterns for different languages
  // Arabic: spaces, Arabic punctuation, line breaks
  // English: spaces, punctuation, line breaks
  const wordBoundaryPattern = /[\s\n\r.!?؟،;:\-\u2000-\u206F\u3000]/;
  
  if (direction === 'backward') {
    // Search backward for the last word boundary
    for (let i = position; i >= Math.max(0, position - maxDistance); i--) {
      if (wordBoundaryPattern.test(text[i])) {
        // Return position after the boundary character
        return Math.min(i + 1, text.length);
      }
    }
    // If no boundary found within maxDistance, try to find at least a space
    for (let i = position; i >= Math.max(0, position - maxDistance * 2); i--) {
      if (text[i] === ' ') {
        return i + 1;
      }
    }
  } else {
    // Search forward for the next word boundary
    for (let i = position; i < Math.min(text.length, position + maxDistance); i++) {
      if (wordBoundaryPattern.test(text[i])) {
        return i;
      }
    }
    // If no boundary found within maxDistance, try to find at least a space
    for (let i = position; i < Math.min(text.length, position + maxDistance * 2); i++) {
      if (text[i] === ' ') {
        return i;
      }
    }
  }
  
  // If no safe break point found, return original position
  return position;
}

/**
 * Finds a safe starting position for overlap that respects word boundaries
 * @param text - The text to analyze
 * @param endPos - The end position of the current chunk
 * @param targetOverlap - The desired overlap size
 * @returns Safe starting position for the overlap that doesn't break words
 */
function findSafeOverlapStart(text: string, endPos: number, targetOverlap: number): number {
  // Calculate the ideal starting position
  const idealStart = endPos - targetOverlap;
  
  // If we're at the beginning of text, no overlap needed
  if (idealStart <= 0) {
    return 0;
  }
  
  // If the ideal start is already at a word boundary, use it
  if (idealStart < text.length) {
    const charBefore = idealStart > 0 ? text[idealStart - 1] : '';
    const charAt = text[idealStart];
    
    const wordBoundaryPattern = /[\s\n\r.!?؟،;:\-\u2000-\u206F\u3000]/;
    
    if (wordBoundaryPattern.test(charBefore) || wordBoundaryPattern.test(charAt)) {
      return idealStart;
    }
  }
  
  // Search backwards for a safe word boundary within reasonable distance
  const maxSearchDistance = Math.min(targetOverlap * 0.5, 100);
  const safeBackwardPos = findSafeBreakPoint(text, idealStart, 'backward', maxSearchDistance);
  
  // Check if the backward position gives us reasonable overlap
  const backwardOverlap = endPos - safeBackwardPos;
  const minAcceptableOverlap = targetOverlap * 0.6; // At least 60% of target overlap
  
  if (backwardOverlap >= minAcceptableOverlap) {
    return safeBackwardPos;
  }
  
  // If backward search doesn't give enough overlap, try forward search
  const safeForwardPos = findSafeBreakPoint(text, idealStart, 'forward', maxSearchDistance);
  const forwardOverlap = endPos - safeForwardPos;
  
  // Use forward position if it gives reasonable overlap, otherwise fall back to ideal
  if (forwardOverlap >= minAcceptableOverlap * 0.8) {
    return safeForwardPos;
  }
  
  // As a last resort, return the ideal position (better than breaking completely)
  return idealStart;
}

/**
 * Improved function to split text by size while respecting word boundaries
 * @param text - The text to split
 * @param chunkSize - Target size of each chunk
 * @param overlap - Overlap between chunks
 * @returns Array of text chunks
 */
function splitTextBySize(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let i = 0;
  
  while (i < text.length) {
    let endPos = Math.min(i + chunkSize, text.length);
    
    // If we're not at the end of the text, find a safe break point
    if (endPos < text.length) {
      // First try to find a safe break point backwards
      const safeEndPos = findSafeBreakPoint(text, endPos, 'backward', chunkSize * 0.2);
      
      // If the safe break point is too far back, try forward
      if (safeEndPos < i + chunkSize * 0.5) {
        const forwardSafePos = findSafeBreakPoint(text, endPos, 'forward', chunkSize * 0.2);
        endPos = forwardSafePos;
      } else {
        endPos = safeEndPos;
      }
    }
    
    const chunk = text.substring(i, endPos).trim();
    if (chunk) {
      // Check for duplicate content before adding chunk
      const lastChunk = chunks[chunks.length - 1];
      const isSubsetOfPrevious = lastChunk && lastChunk.includes(chunk);
      const isDuplicateContent = lastChunk && chunk.includes(lastChunk);
      
      if (!isSubsetOfPrevious && !isDuplicateContent) {
        chunks.push(chunk);
      }
    }
    
    // IMPROVED: Calculate next position with word boundary consideration
    let nextPos = findSafeOverlapStart(text, endPos, overlap);
    
    // Make sure we don't go backwards and get stuck in a loop
    if (nextPos <= i) {
      nextPos = i + Math.min(chunkSize - overlap, endPos - i);
    }
    
    // CRITICAL FIX: Check if remaining text is too small to warrant a new chunk
    const remainingLength = text.length - nextPos;
    const minNewChunkSize = Math.max(overlap * 1.5, chunkSize * 0.3);
    
    if (remainingLength <= overlap || remainingLength < minNewChunkSize) {
      // Remaining text is too small or would be entirely overlap - don't create new chunk
      break;
    }
    
    i = nextPos;
    
    // Safety check to prevent infinite loops
    if (i >= endPos && endPos >= text.length) {
      break;
    }
  }
  
  return chunks;
}

/**
 * Preprocesses text for embedding models by cleaning and normalizing
 */
function preprocessText(text: string): string {
  if (!text) return '';
  
  return text
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Normalize line breaks
    .replace(/\r\n/g, '\n')
    // Remove unsafe characters
    .replace(/[\u0000-\u001F\u007F-\u009F\u2000-\u200F\uFEFF]/g, '')
    // Keep parentheses which are common in many languages
    .replace(/[^\p{L}\p{N}\p{P}\p{Z}\p{Sc}\p{Emoji}]/gu, '')
    // Replace multiple punctuation (keep Arabic punctuation like ؟،)
    .replace(/([.,!?;:؟،])\1+/g, '$1')
    .trim();
}

/**
 * Creates metadata for text chunks
 * Now with special handling for CSV content
 */
function createChunkMetadata(
  text: string,
  chunks: string[],
  documentId: string
): Array<{ text: string; metadata: Record<string, any> }> {
  // Check if content is CSV first
  if (isCSVContent(text)) {
    logger.log('Creating CSV-specific metadata for chunks');
    return createCSVChunkMetadata(text, chunks, documentId);
  }
  
  // Original metadata creation for non-CSV content
  return chunks.map((chunk, index) => {
    // Calculate position of chunk in original document
    const position = text.indexOf(chunk);
    
    return {
      text: chunk,
      metadata: {
        document_id: documentId,
        chunk_index: index,
        chunk_count: chunks.length,
        position: position >= 0 ? position : undefined,
        character_count: chunk.length,
        word_count: chunk.split(/\s+/).filter(Boolean).length
      }
    };
  });
}

/**
 * Extracts text from a file using the Tika server
 */
async function extractTextFromFile(fileUrl: string, mimeType: string): Promise<string> {
  logger.log(`Extracting text from file using Tika: ${fileUrl}`);
  
  try {
    // Download the file
    const fileResponse = await fetch(fileUrl);
    
    if (!fileResponse.ok) {
      throw new Error(`Failed to download file: ${fileResponse.status} ${fileResponse.statusText}`);
    }
    
    // Get file buffer
    const fileBuffer = await fileResponse.arrayBuffer();
    
    // Check if this is a CSV file based on mime type
    const isCSV = mimeType && (
      mimeType.includes('csv') || 
      mimeType.includes('text/comma-separated-values') ||
      mimeType.includes('text/csv')
    );
    
    if (isCSV) {
      logger.log('CSV file detected, returning raw content for specialized processing');
      // For CSV files, return the raw content for specialized processing with Papa Parse
      const decoder = new TextDecoder('utf-8');
      return decoder.decode(fileBuffer);
    }
    
    // For non-CSV files, use Tika as before
    const tikaUrl = 'https://tika.convgo.com/tika';
    logger.log(`Calling Tika server at ${tikaUrl}`);
    
    const tikaResponse = await fetch(tikaUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
        'Accept': 'text/plain'
      },
      body: fileBuffer
    });
    
    if (!tikaResponse.ok) {
      throw new Error(`Tika extraction failed: ${tikaResponse.status} ${tikaResponse.statusText}`);
    }
    
    // Get extracted text
    const extractedText = await tikaResponse.text();
    logger.log(`Successfully extracted ${extractedText.length} characters of text using Tika`);
    
    return extractedText || 'No text content could be extracted from this file.';
  } catch (error) {
    logger.error('Error extracting text from file:', error);
    throw error;
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get the fileId and chunking settings from the request
    const { fileId, chunkingSettings } = await req.json();
    
    if (!fileId) {
      return new Response(
        JSON.stringify({ error: 'Missing fileId parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the request with chunking settings if provided
    logger.log('Text extraction request for file:', fileId);
    if (chunkingSettings) {
      logger.log('With custom chunking settings:', JSON.stringify(chunkingSettings));
    } else {
      logger.log('Using default chunking settings');
    }

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get file info from the database
    const { data: fileData, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fileError) {
      logger.error('Error fetching file:', fileError);
      return new Response(
        JSON.stringify({ error: 'File not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update status to processing
    await supabase
      .from('files')
      .update({
        text_extraction_status: {
          status: 'processing',
          last_updated: new Date().toISOString()
        }
      })
      .eq('id', fileId);

    // Generate a signed URL for the file
    const { data: signedUrl, error: signedUrlError } = await supabase
      .storage
      .from('files')
      .createSignedUrl(fileData.path, 60); // 60 seconds expiry

    if (signedUrlError || !signedUrl?.signedUrl) {
      logger.error('Error creating signed URL:', signedUrlError);
      
      // Update file status to error
      await supabase
        .from('files')
        .update({
          text_extraction_status: {
            status: 'error',
            error: 'Failed to create signed URL for file',
            last_updated: new Date().toISOString()
          }
        })
        .eq('id', fileId);
        
      return new Response(
        JSON.stringify({ error: 'Failed to create signed URL for file' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if this is a CSV file based on mime type
    const isCSV = fileData.mime_type && (
      fileData.mime_type.includes('csv') || 
      fileData.mime_type.includes('text/comma-separated-values') ||
      fileData.mime_type.includes('text/csv')
    );
    
    // Extract text from file - this now handles CSV files differently
    let extractedText;
    try {
      extractedText = await extractTextFromFile(signedUrl.signedUrl, fileData.mime_type);
    } catch (error) {
      logger.error('Error in text extraction:', error);
      
      // Update file status to error
      await supabase
        .from('files')
        .update({
          text_extraction_status: {
            status: 'error',
            error: error.message,
            last_updated: new Date().toISOString()
          }
        })
        .eq('id', fileId);
        
      return new Response(
        JSON.stringify({ error: `Text extraction failed: ${error.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Apply text chunking with provided settings or default
    const chunkOptions = {
      ...DEFAULT_CHUNKING_OPTIONS,
      ...chunkingSettings
    };
    
    logger.log('Final chunking options:', JSON.stringify(chunkOptions));
    
    let chunksWithMetadata;
    
    // Use different processing paths for CSV vs non-CSV files
    if (isCSV) {
      logger.log('Processing CSV file with Papa Parse for better header handling');
      try {
        // For CSV files, use Papa Parse to preserve structure
        const parsedCSV = parseCSVContent(extractedText);
        
        // Create chunks with header in each chunk
        const csvChunks = chunkParsedCSV(parsedCSV, chunkOptions.chunkSize);
        
        // Create metadata for chunks
        chunksWithMetadata = createParsedCSVChunkMetadata(parsedCSV, csvChunks, fileId);
        
        logger.log(`Created ${csvChunks.length} CSV chunks with Papa Parse using chunk size ${chunkOptions.chunkSize}`);
      } catch (error) {
        logger.error('Error using Papa Parse for CSV, falling back to normal processing:', error);
        // If Papa Parse fails, fall back to the existing CSV processing
        const processedText = preprocessText(extractedText);
        const chunks = chunkText(processedText, chunkOptions);
        chunksWithMetadata = createChunkMetadata(processedText, chunks, fileId);
      }
    } else {
      // For non-CSV files, use the regular processing
      const processedText = preprocessText(extractedText);
      const chunks = chunkText(processedText, chunkOptions);
      chunksWithMetadata = createChunkMetadata(processedText, chunks, fileId);
      logger.log(`Created ${chunks.length} chunks for non-CSV file`);
    }

    // Store chunks in the text_chunks table with language detection for each chunk
    for (let i = 0; i < chunksWithMetadata.length; i++) {
      const chunk = chunksWithMetadata[i];
      
      // Detect language for this specific chunk
      const chunkLanguage = detectChunkLanguage(chunk.text);
      
      // Determine text direction based on detected language
      const textDirection = getTextDirection(chunkLanguage);
      
      // Insert chunk with language information
      const { error: chunkError } = await supabase
        .from('text_chunks')
        .insert({
          file_id: fileId,
          content: chunk.text,
          metadata: chunk.metadata,
          chunk_order: i,
          language: chunkLanguage,
          direction: textDirection
        });

      if (chunkError) {
        logger.error('Error storing text chunk:', chunkError);
      }
    }

    // Update file with extracted text and set status to complete
    const { error: updateError } = await supabase
      .from('files')
      .update({
        text_content: extractedText,
        text_extraction_status: {
          status: 'complete',
          last_updated: new Date().toISOString()
        }
      })
      .eq('id', fileId);

    if (updateError) {
      logger.error('Error updating file with extracted text:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update file with extracted text' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Trigger language detection
    try {
      const { error: langDetectError } = await supabase.functions.invoke('detect-language', {
        body: { fileId }
      });

      if (langDetectError) {
        logger.error('Error triggering language detection:', langDetectError);
        // Continue execution - language detection failure shouldn't fail the whole process
      }
    } catch (e) {
      logger.error('Exception triggering language detection:', e);
      // Continue execution - language detection failure shouldn't fail the whole process
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: isCSV ? 'CSV file processed with Papa Parse' : 'Text extracted and chunked successfully with language detection',
        chunkCount: chunksWithMetadata.length
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    logger.error('Error processing request:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
