
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { Link, useLocation } from "react-router-dom";
import { Folder, Home, LogOut, Phone, Link2, Radio, MessageSquare } from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const FULL_NAME_MAX_LENGTH = 25;
const navigation = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: Home
  }, 
  {
    name: 'My Files',
    href: '/files',
    icon: Folder
  }, 
  {
    name: 'WhatsApp Numbers',
    href: '/whatsapp',
    icon: Phone
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
    icon: MessageSquare
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
    <Sidebar variant="inset" collapsible={isMobile ? "offcanvas" : "none"}>
      <SidebarHeader className="flex items-center justify-center p-4">
        <div className="text-2xl font-bold text-primary">ConvGo.com</div>
      </SidebarHeader>

      <SidebarContent>
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
                      className="group"
                    >
                      <Link to={item.href} className={cn(
                        "relative",
                        isActive && "after:content-[''] after:absolute after:bottom-0 after:left-4 after:right-4 after:h-0.5 after:bg-primary after:animate-in after:fade-in-0 after:zoom-in-95"
                      )}>
                        <item.icon className={cn(
                          "transition-transform duration-200 group-hover:scale-110",
                          isActive ? "text-primary group-hover:text-primary" : "group-hover:text-primary/80"
                        )} />
                        <span className={cn(
                          "transition-colors duration-200",
                          isActive ? "text-primary group-hover:text-primary" : "group-hover:text-primary/80" 
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
      </SidebarContent>

      <SidebarFooter>
        {profile && (
          <>
            <div className="flex items-center gap-3 px-4 pb-4">
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
                className="w-full justify-start gap-2 transition hover:scale-105 active:scale-95" 
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </div>
          </>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
