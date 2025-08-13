import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { Link, useLocation } from "react-router-dom";
import { FolderCog, LogOut, MessageCirclePlus, FileSymlink, BrainCog, AlignJustify, Headset, UserCog, Gauge, ChevronUp, HelpCircle, Crown } from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger } from "@/components/ui/sidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { LogoWithText } from "./Logo";
import { ScrollArea } from "./ui/scroll-area";
import logger from '@/utils/logger';

const FULL_NAME_MAX_LENGTH = 25;
const navigation = [{
  name: 'WhatsApp Numbers',
  href: '/whatsapp',
  icon: MessageCirclePlus
}, {
  name: 'Files Management',
  href: '/files',
  icon: FolderCog
}, {
  name: 'AI Knowledge Base',
  href: '/whatsapp-file-config',
  icon: FileSymlink
}, {
  name: 'AI Assistant Settings',
  href: '/whatsapp-ai-config',
  icon: BrainCog
}, {
  name: 'Smart Escalation Rules',
  href: '/whatsapp-support-config',
  icon: Headset
}, {
  name: 'Usage Insights',
  href: '/ai-usage',
  icon: Gauge
}];

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
}

export function AppSidebar() {
  const {
    user
  } = useAuth();
  const location = useLocation();
  const isMobile = useIsMobile();

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

  const truncatedName = profile?.name && profile.name.length > FULL_NAME_MAX_LENGTH ? `${profile.name.slice(0, FULL_NAME_MAX_LENGTH)}...` : profile?.name;

  return (
    <Sidebar variant="inset" collapsible={isMobile ? "offcanvas" : "none"} className="flex flex-col h-screen">
      <div className="flex flex-col h-full">
        {/* Header Section */}
        <SidebarHeader className="flex items-center p-4 flex-shrink-0 border-b border-sidebar-border/50">
          <div className="flex items-center justify-between w-full">
            <LogoWithText className="text-xl font-bold" />
            {isMobile && (
              <SidebarTrigger className="md:hidden ml-2 h-8 w-8">
                <AlignJustify className="h-5 w-5" />
              </SidebarTrigger>
            )}
          </div>
        </SidebarHeader>

        {/* Content Section */}
        <SidebarContent className="flex-1 min-h-0 overflow-hidden">
          <div className="flex flex-col h-full">
            <ScrollArea className="flex-1 px-1 py-1">
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu className="space-y-1">
                    {navigation.map(item => {
                      const isActive = location.pathname === item.href;
                      return (
                        <SidebarMenuItem key={item.name}>
                          <SidebarMenuButton 
                            asChild 
                            isActive={isActive} 
                            tooltip={item.name}
                            className={cn(
                              "w-full h-11 px-4 py-0 text-sm font-medium rounded-md transition-all duration-200",
                              "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/50 dark:hover:text-blue-300",
                              "group relative overflow-hidden",
                              isActive && [
                                "bg-blue-50 text-blue-700 border border-blue-200 shadow-sm dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800",
                                "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 before:bg-blue-600"
                              ]
                            )}
                          >
                            <Link to={item.href} className="flex items-center gap-3 w-full">
                              <item.icon className={cn(
                                "h-8 w-8 shrink-0 transition-transform duration-200",
                                "group-hover:scale-110",
                                isActive ? "text-blue-700 dark:text-blue-300" : "text-sidebar-foreground"
                              )} />
                              <span className={cn(
                                "truncate transition-colors duration-200",
                                isActive ? "text-blue-700 dark:text-blue-300" : "text-sidebar-foreground"
                              )}>
                                {item.name}
                              </span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </ScrollArea>
          </div>
        </SidebarContent>

        {/* Footer Section with Dropdown */}
        <SidebarFooter className="border-t border-sidebar-border/50 p-3 flex-shrink-0">
          {profile && (
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton 
                      size="lg" 
                      className={cn(
                        "w-full h-12 px-3 py-2 rounded-lg",
                        "hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-all duration-200",
                        "border border-blue-200 hover:border-blue-300 dark:border-blue-800 dark:hover:border-blue-700",
                        "group"
                      )}
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={profile.avatarUrl || undefined} />
                        <AvatarFallback className="text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                          {getInitials(profile.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col items-start flex-1 min-w-0">
                        <span className="truncate text-sm font-medium text-sidebar-foreground">
                          {truncatedName}
                        </span>
                        <span className="text-xs text-sidebar-foreground/60">
                          Manage account
                        </span>
                      </div>
                      <ChevronUp className="h-4 w-4 text-sidebar-foreground/60 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent 
                    side="top" 
                    align="end" 
                    className="w-56 mb-2"
                    sideOffset={4}
                  >
                    <DropdownMenuItem asChild>
                      <Link 
                        to="/account-settings" 
                        className="flex items-center gap-2 cursor-pointer"
                      >
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
              </SidebarMenuItem>
            </SidebarMenu>
          )}
        </SidebarFooter>
      </div>
    </Sidebar>
  );
}
