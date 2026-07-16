import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  ClipboardList,
  Calculator,
  Settings,
} from "lucide-react";
import logoInnosite from "@/assets/logo-innosite.png";










import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

import { AIFloatingButton } from "@/components/AIFloatingButton";
import { useCurrentRoles } from "@/hooks/use-current-roles";
import { canAccessPath } from "@/lib/permissions";
import { usePermissionMatrix } from "@/hooks/use-permission-matrix";


const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Smeta (B.O.Q)", url: "/master-zayavka", icon: BookOpen },
  { title: "Jurnal", url: "/master-jadval", icon: ClipboardList },


  { title: "Buxgalteriya", url: "/buxalteriya", icon: Calculator },
  { title: "Xodimlar", url: "/brigade-balance", icon: Users },
  { title: "Sozlamalar", url: "/settings", icon: Settings },
] as const;

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const handleNav = () => { if (isMobile) setOpenMobile(false); };
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const { roles, loading } = useCurrentRoles();
  const { matrix, loading: matrixLoading } = usePermissionMatrix();
  const visibleItems = loading || matrixLoading
    ? items
    : items.filter((it) => canAccessPath(it.url, roles, matrix));

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center justify-center px-3 py-4">
          {collapsed ? (
            <span
              className="text-sidebar-foreground font-sans"
              style={{
                fontWeight: 900,
                fontSize: 22,
                letterSpacing: "-0.045em",
                lineHeight: 1,
              }}
            >
              i<span style={{ color: "#F97316" }}>o</span>
            </span>
          ) : (
            <img
              src={logoInnosite}
              alt="innosite"
              className="h-10 w-auto object-contain"
              draggable={false}
            />
          )}
        </div>


      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Bo'limlar</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => {
                const active = currentPath === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <Link to={item.url} onClick={handleNav} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              <SidebarMenuItem>
                <AIFloatingButton variant="sidebar" collapsed={collapsed} />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>

        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
