import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { Link, useLocation } from "react-router-dom";
import { 
  FolderCog, 
  LogOut, 
  QrCode, 
  BrainCog, 
  AlignJustify, 
  UserCog, 
  Gauge, 
  ChevronUp, 
  HelpCircle, 
  Crown,
  X,
  Users,
  Headset,
  Settings
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { LogoWithText } from "./Logo";
import { ScrollArea } from "./ui/scroll-area";
import logger from '@/utils/logger';
import { useEffect, useImperativeHandle, useState, forwardRef } from 'react';
import { Badge } from './ui/badge';
export type SimpleSidebarHandle = {
  open: () => void;
  close: () => void;
  toggle: () => void;
};

const FULL_NAME_MAX_LENGTH = 25;

const navigation = [{
  name: 'WhatsApp Numbers',
  href: '/whatsapp',
  icon: QrCode
}, {
  name: 'AI Knowledge Base',
  href: '/knowledge-base',
  icon: FolderCog
}, {
  name: 'AI Assistant Settings',
  href: '/whatsapp-ai-config',
  icon: BrainCog
}, {
  name: 'AI Personalities',
  href: '/ai-personalities',
  icon: Users
}, {
  name: 'Smart Escalation',
  href: '/escalation-management',
  icon: Headset,
  badge: 'escalated'
}, {
  name: 'Usage Insights',
  href: '/ai-usage',
  icon: Gauge
}];

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
}

export const SimpleSidebar = forwardRef<SimpleSidebarHandle, Record<string, never>>(function SimpleSidebar(_props, ref) {
  const { user } = useAuth();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrollLockY, setScrollLockY] = useState<number | null>(null);
  const [escalatedCount, setEscalatedCount] = useState(0);

  // Fetch escalated conversations count
  useEffect(() => {
    if (!user) return;

    const fetchEscalatedCount = async () => {
      try {
        const { count, error } = await supabase
          .from('escalated_conversations')
          .select('*', { count: 'exact', head: true })
          .is('resolved_at', null);

        if (!error && count !== null) {
          setEscalatedCount(count);
        }
      } catch (error) {
        logger.error('Error fetching escalated count:', error);
      }
    };

    fetchEscalatedCount();
    
    // Set up real-time subscription for escalated conversations
    const channel = supabase
      .channel('escalated-conversations-count')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'escalated_conversations'
        },
        () => {
          fetchEscalatedCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useImperativeHandle(ref, () => ({
    open: () => setMobileOpen(true),
    close: () => setMobileOpen(false),
    toggle: () => setMobileOpen((v) => !v),
  }), []);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast.success("Logged out successfully");
    } catch (error) {
      logger.error('Error logging out:', error);
      toast.error("Failed to log out");
    }
  };

  const profile = user ? {
    name: user.user_metadata?.full_name || 'User',
    avatarUrl: user.user_metadata?.avatar_url
  } : null;

  const truncatedName = profile?.name && profile.name.length > FULL_NAME_MAX_LENGTH 
    ? `${profile.name.slice(0, FULL_NAME_MAX_LENGTH)}...` 
    : profile?.name;

  const closeMobile = () => setMobileOpen(false);

  useEffect(() => {
    if (!isMobile) return;
    if (mobileOpen) {
      const y = window.scrollY;
      setScrollLockY(y);
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${y}px`;
    } else {
      const top = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
      if (scrollLockY !== null) {
        window.scrollTo(0, scrollLockY);
      } else if (top) {
        const restoreY = Number(top.replace('-', '').replace('px', '')) || 0;
        window.scrollTo(0, restoreY);
      }
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
    };
  }, [mobileOpen, isMobile, scrollLockY]);

  const SidebarContent = () => (
    <>
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white dark:bg-gray-900 flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <LogoWithText className="text-xl font-bold" />
        {isMobile && (
          <Button
            variant="ghost"
            size="sm"
            onClick={closeMobile}
            className="md:hidden"
          >
            <X className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full px-2 py-2">
          <nav className="space-y-2">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={closeMobile}
                  className={cn(
                    "relative flex items-center gap-2 px-3 py-3 text-sm font-normal rounded-lg overflow-hidden transition-all duration-200",
                    "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/50 dark:hover:text-blue-300",
                    isActive 
                      ? "glass-active rounded-lg text-blue-700 font-normal dark:text-blue-300" 
                      : "text-slate-900 font-normal dark:text-slate-100"
                  )}
                >
                  <item.icon className={cn(
                    "h-5 w-5 shrink-0 transition-transform duration-200",
                    "group-hover:scale-110",
                    isActive ? "text-blue-700 dark:text-blue-300" : "text-slate-900 dark:text-slate-100"
                  )} />
                  <span className="truncate">{item.name}</span>
                  {item.badge === 'escalated' && escalatedCount > 0 && (
                    <Badge 
                      variant="destructive" 
                      className="ml-auto animate-pulse"
                    >
                      {escalatedCount}
                    </Badge>
                  )}
                  {isActive && (
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-700" />
                  )}
                </Link>
              );
            })}
          </nav>
        </ScrollArea>
      </div>

      {/* Footer with User Profile */}
      {profile && (
        <div className="sticky bottom-0 z-20 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full h-auto p-2 justify-start hover:bg-blue-50 dark:hover:bg-blue-950/50 border border-gray-200 hover:border-blue-300 dark:border-gray-700 dark:hover:border-blue-700"
              >
                <Avatar className="h-10 w-10 rounded-2xl">
                  <AvatarImage src={profile.avatarUrl || undefined} />
                  <AvatarFallback className="text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                    {getInitials(profile.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start flex-1 min-w-0">
                  <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {truncatedName}
                  </span>
                  <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                    Manage account
                  </span>
                </div>
                <ChevronUp className="h-4 w-4 text-gray-400 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              side="top" 
              align="end" 
              className="w-56 mb-2"
              sideOffset={4}
            >
              <DropdownMenuItem asChild>
                <Link to="/account-settings" className="flex items-center gap-2 cursor-pointer">
                  <UserCog className="h-4 w-4" />
                  <span>Account Settings</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <HelpCircle className="h-4 w-4 mr-2" />
                <span>Support</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Crown className="h-4 w-4 mr-2" />
                <span>Upgrade</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={handleLogout}
                className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/50"
              >
                <LogOut className="h-4 w-4 mr-2" />
                <span>Logout</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Desktop Sidebar - GUARANTEED BORDER */}
      <aside className={cn(
        "hidden md:flex flex-col h-screen w-64 bg-white dark:bg-gray-900",
        "border-r border-gray-200 dark:border-gray-600", // GUARANTEED VISIBLE BORDER
        "shadow-sm fixed left-0 top-0 z-10"
      )}>
        <SidebarContent />
      </aside>

      {/* Mobile Overlay Sidebar with smooth animation */}
      {isMobile && (
        <>
          {/* Backdrop */}
          <div
            className={cn(
              "fixed inset-0 z-40 md:hidden bg-black/50 transition-opacity duration-300 ease-out",
              mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
            )}
            onClick={closeMobile}
          />

          {/* Mobile Sidebar */}
          <aside
            aria-hidden={!mobileOpen}
            className={cn(
              "fixed left-0 top-0 h-[100dvh] w-80 bg-white dark:bg-gray-900 z-50 md:hidden",
              "border-r border-gray-200 dark:border-gray-600", // GUARANTEED VISIBLE BORDER
              "shadow-xl flex flex-col transform transition-transform duration-300 ease-out will-change-transform",
              mobileOpen ? "translate-x-0" : "-translate-x-full"
            )}
          >
            <SidebarContent />
          </aside>
        </>
      )}

      {/* Spacer for desktop */}
      <div className="hidden md:block w-64 flex-shrink-0" />
    </>
  );
});