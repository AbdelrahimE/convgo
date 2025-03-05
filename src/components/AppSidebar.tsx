
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import {
  Home,
  FileText,
  Database,
  MessageSquareText,
  Braces,
  FileCode,
  SquareCode,
  Search
} from 'lucide-react';

export function AppSidebar({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const { user, signOut } = useAuth();

  return (
    <div className={cn("pb-12", className)}>
      <div className="space-y-4 py-4">
        <div className="px-4 py-2">
          <h2 className="mb-2 px-2 text-xl font-semibold tracking-tight">
            WhatsApp AI Assistant
          </h2>
          <div className="space-y-1">
            <Button
              variant={pathname === '/' ? "secondary" : "ghost"}
              className="w-full justify-start"
              asChild
            >
              <Link to="/">
                <Home className="mr-2 h-4 w-4" />
                <span>Home</span>
              </Link>
            </Button>
            {user && (
              <>
                <Button
                  variant={pathname === '/whatsapp' ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  asChild
                >
                  <Link to="/whatsapp">
                    <MessageSquareText className="mr-2 h-4 w-4" />
                    <span>WhatsApp</span>
                  </Link>
                </Button>
                <Button
                  variant={pathname === '/files' ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  asChild
                >
                  <Link to="/files">
                    <FileText className="mr-2 h-4 w-4" />
                    <span>Files</span>
                  </Link>
                </Button>
                <Button
                  variant={pathname === '/metadata' ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  asChild
                >
                  <Link to="/metadata">
                    <Database className="mr-2 h-4 w-4" />
                    <span>Metadata</span>
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>

        {user && (
          <>
            <Separator />
            <div className="px-4 py-2">
              <h2 className="mb-2 px-2 text-lg font-semibold tracking-tight">
                Testing Tools
              </h2>
              <div className="space-y-1">
                <Button
                  variant={pathname === '/text-processing' ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  asChild
                >
                  <Link to="/text-processing">
                    <FileCode className="mr-2 h-4 w-4" />
                    <span>Text Processing</span>
                  </Link>
                </Button>
                <Button
                  variant={pathname === '/openai-test' ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  asChild
                >
                  <Link to="/openai-test">
                    <Braces className="mr-2 h-4 w-4" />
                    <span>OpenAI</span>
                  </Link>
                </Button>
                <Button
                  variant={pathname === '/semantic-search' ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  asChild
                >
                  <Link to="/semantic-search">
                    <Search className="mr-2 h-4 w-4" />
                    <span>Semantic Search</span>
                  </Link>
                </Button>
              </div>
            </div>

            <Separator />
          </>
        )}

        <div className="px-4 py-2">
          <div className="space-y-1">
            {user ? (
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => signOut?.()}
              >
                <SquareCode className="mr-2 h-4 w-4" />
                <span>Sign Out</span>
              </Button>
            ) : (
              <Button
                variant={pathname === '/auth' ? "secondary" : "ghost"}
                className="w-full justify-start"
                asChild
              >
                <Link to="/auth">
                  <SquareCode className="mr-2 h-4 w-4" />
                  <span>Sign In</span>
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
