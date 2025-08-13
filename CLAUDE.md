# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Development server:**
```bash
npm run dev
```
Runs Vite dev server on port 8080 with hot reloading.

**Build commands:**
```bash
npm run build        # Production build
npm run build:dev    # Development build
```

**Code quality:**
```bash
npm run lint         # ESLint checking
npm run preview      # Preview production build locally
```

## Architecture Overview

This is a React + TypeScript application for WhatsApp AI conversation management, built with Vite and Supabase backend integration.

### Core Architecture:
- **Frontend:** React 18 + TypeScript + Vite
- **UI Components:** shadcn/ui + Radix UI primitives + Tailwind CSS
- **Backend:** Supabase (database, auth, edge functions)
- **State Management:** React Context (AuthContext) + TanStack Query
- **Routing:** React Router v6 with protected routes

### Project Structure:
- `src/components/` - Reusable UI components and shadcn/ui components
- `src/pages/` - Route-level page components 
- `src/contexts/` - React contexts (AuthContext for authentication)
- `src/hooks/` - Custom React hooks
- `src/integrations/supabase/` - Supabase client and type definitions
- `src/utils/` - Utility functions (audio processing, text processing, logging)
- `supabase/functions/` - Supabase Edge Functions for backend logic
- `supabase/migrations/` - Database migration files

### Key Integration Patterns:

**Authentication Flow:**
- Uses Supabase Auth with session management
- AuthProvider wraps the entire app
- ProtectedRoute component guards authenticated routes
- All routes except `/auth` require authentication

**Data Layer:**
- Supabase client configured in `src/integrations/supabase/client.ts`
- TypeScript types auto-generated in `src/integrations/supabase/types.ts`
- Database includes tables for files, document embeddings, WhatsApp data
- Edge functions handle AI processing, webhook management, language detection

**Component Architecture:**
- Uses shadcn/ui design system with Radix UI primitives
- Custom components extend shadcn base components
- SimpleSidebar handles navigation with mobile responsiveness
- Error boundaries (ErrorBoundary, NetworkErrorBoundary) wrap the app

**Key Features:**
- File management with document embeddings and chunk processing
- WhatsApp integration with AI responses and webhook monitoring
- Multi-language support with automatic language detection
- Real-time monitoring of AI usage and webhook events
- Audio processing and voice transcription capabilities

### Build Configuration:
- Vite with React SWC plugin for fast builds
- Path alias `@/` maps to `src/` directory
- Lovable-tagger plugin enabled in development mode
- Development server runs on `::` (all interfaces) port 8080