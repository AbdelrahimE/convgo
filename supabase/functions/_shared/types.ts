/**
 * Shared type definitions for Edge Functions
 * Provides type-safe interfaces replacing any types
 */

// Base metadata interface for all chunks
export interface BaseChunkMetadata {
  document_id: string;
  chunk_index: number;
  chunk_count: number;
  character_count: number;
  position?: number;
  word_count?: number;
}

// CSV-specific metadata interface
export interface CSVChunkMetadata extends BaseChunkMetadata {
  is_csv: true;
  row_count: number;
  total_rows: number;
  data_format: 'tabular';
  column_count?: number;
  column_headers?: string[];
  data_segment?: string;
  position_percent?: string;
  product_count?: number;
  products?: string[];
  simplified_processing?: boolean;
}

// Regular text chunk metadata interface
export interface TextChunkMetadata extends BaseChunkMetadata {
  is_csv?: false;
  language?: string;
  direction?: string;
}

// Union type for all possible chunk metadata
export type ChunkMetadata = CSVChunkMetadata | TextChunkMetadata;

// Chunk with metadata interface
export interface ChunkWithMetadata {
  text: string;
  metadata: ChunkMetadata;
}

// Chunking options interface
export interface ChunkingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  splitBySentence?: boolean;
  structureAware?: boolean;
  preserveTables?: boolean;
  cleanRedundantData?: boolean;
}