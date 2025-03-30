
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { Link, useLocation } from "react-router-dom";
import { Folder, LogOut, Phone, Link2, Radio, AlignJustify, Headphones } from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger } from "@/components/ui/sidebar";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { LogoWithText } from "./Logo";
import { ScrollArea } from "./ui/scroll-area";

const FULL_NAME_MAX_LENGTH = 25;
const navigation = [
  {
    name: 'WhatsApp Numbers',
    href: '/whatsapp',
    icon: Phone
  }, 
  {
    name: 'My Files',
    href: '/files',
    icon: Folder
  }, 
  {
    name: 'Linked Files',
    href: '/whatsapp-file-config',
    icon: Link2
  },
  {
    name: 'AI Settings',
    href: '/whatsapp-ai-config',
    icon: Radio
  },
  {
    name: 'Support Config',
    href: '/whatsapp-support-config',
    icon: Headphones
  }
];

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
}

export function AppSidebar() {
  const { user } = useAuth();
  const location = useLocation();
  const isMobile = useIsMobile();
  
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast.success("Logged out successfully");
    } catch (error) {
      console.error('Error logging out:', error);
      toast.error("Failed to log out");
    }
  };
  
  const profile = user ? {
    name: user.user_metadata?.full_name || 'User',
    avatarUrl: user.user_metadata?.avatar_url
  } : null;
  
  const truncatedName = profile?.name && profile.name.length > FULL_NAME_MAX_LENGTH ? 
    `${profile.name.slice(0, FULL_NAME_MAX_LENGTH)}...` : profile?.name;
  
  return (
    <Sidebar variant="inset" collapsible={isMobile ? "offcanvas" : "none"} className="flex flex-col h-screen">
      <div className="flex flex-col h-full">
        <SidebarHeader className="flex items-center p-4 flex-shrink-0">
          <div className="flex items-center justify-between w-full">
            <LogoWithText className="text-xl" />
            {isMobile && (
              <SidebarTrigger className="md:hidden ml-2">
                <AlignJustify className="h-10 w-10" />
              </SidebarTrigger>
            )}
          </div>
        </SidebarHeader>

        <SidebarContent className="flex-1 min-h-0 overflow-hidden">
          <div className="flex flex-col h-full">
            <ScrollArea className="flex-1 px-2">
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {navigation.map(item => {
                      const isActive = location.pathname === item.href;
                      return (
                        <SidebarMenuItem key={item.name}>
                          <SidebarMenuButton
                            asChild
                            isActive={isActive}
                            tooltip={item.name}
                            className="group transition-all duration-200"
                          >
                            <Link to={item.href} className={cn(
                              "relative",
                              isActive && "pl-3 after:content-[''] after:absolute after:bottom-0 after:left-1 after:top-0 after:w-1 after:bg-sidebar-primary after:rounded-r-md after:animate-in after:fade-in-0 after:zoom-in-95"
                            )}>
                              <item.icon className={cn(
                                "transition-all duration-200 group-hover:scale-110 group-hover:text-sidebar-primary",
                                isActive ? "text-sidebar-primary" : ""
                              )} />
                              <span className={cn(
                                "transition-all duration-200 group-hover:text-sidebar-primary font-semibold",
                                isActive ? "text-sidebar-primary" : ""
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

        <SidebarFooter className="border-t border-sidebar-border flex-shrink-0">
          {profile && (
            <>
              <div className="flex items-center gap-3 px-4 pb-4 pt-4">
                <Avatar>
                  <AvatarImage src={profile.avatarUrl || undefined} />
                  <AvatarFallback>{getInitials(profile.name)}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col overflow-hidden">
                  <span className="truncate font-medium text-sm">
                    {truncatedName}
                  </span>
                </div>
              </div>
              <div className="p-4 pt-0">
                <Button 
                  variant="outline" 
                  className="w-full justify-start gap-2 transition hover:bg-sidebar-primary/10 text-sidebar-foreground hover:text-sidebar-primary hover:border-sidebar-primary active:scale-95" 
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </Button>
              </div>
            </>
          )}
        </SidebarFooter>
      </div>
    </Sidebar>
  );
}
