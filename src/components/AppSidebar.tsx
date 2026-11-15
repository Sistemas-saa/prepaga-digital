
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FileText,
  User,
  ShoppingBag,
  FileImage,
  Building2,
  CreditCard,
  UserCog,
  Shield,
  Workflow,
  BarChart3,
  Settings,
  AlertCircle,
  HandCoins,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";

import { MainNavItem } from "@/types";
import { LogoutButton } from './LogoutButton';
import { useRoutePermissions } from '@/hooks/useRoutePermissions';
import { useMenuVisibility } from '@/hooks/useMenuConfig';
import { useBranding } from './CompanyBrandingProvider';
import { useState } from 'react';

export function AppSidebar() {
  const location = useLocation();
  const permissions = useRoutePermissions();
  const { isVisible: isMenuVisible } = useMenuVisibility();
  const { logoUrl, companyName } = useBranding();
  const [logoBroken, setLogoBroken] = useState(false);

  // Apply base permissions first, then menu config override
  const applyMenuConfig = (items: (MainNavItem & { routeKey: string })[]) => {
    return items.filter(item => {
      if (!item.visible) return false;
      const configValue = isMenuVisible(item.routeKey);
      // null = no config or super_admin, use base permission
      if (configValue === null) return true;
      return configValue;
    });
  };

  const menuItems = applyMenuConfig([
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: LayoutDashboard,
      visible: permissions.canViewDashboard,
      routeKey: 'dashboard',
    },
    {
      title: "Ventas",
      url: "/sales",
      icon: ShoppingBag,
      visible: permissions.canViewSales,
      routeKey: 'sales',
    },
    {
      title: "Clientes",
      url: "/clients",
      icon: Users,
      visible: permissions.canViewClients,
      routeKey: 'clients',
    },
    {
      title: "Planes",
      url: "/plans",
      icon: CreditCard,
      visible: permissions.canViewPlans,
      routeKey: 'plans',
    },
    {
      title: "Documentos",
      url: "/documents",
      icon: FileText,
      visible: permissions.canViewDocuments,
      routeKey: 'documents',
    },
    {
      title: "Templates",
      url: "/templates",
      icon: FileImage,
      visible: permissions.canViewTemplates,
      routeKey: 'templates',
    },
    {
      title: "Flujo de Firmas",
      url: "/signature-workflow",
      icon: Workflow,
      visible: permissions.canViewDocuments,
      routeKey: 'signature-workflow',
    },
    {
      title: "Auditoría",
      url: "/audit",
      icon: Shield,
      visible: permissions.canViewAudit,
      routeKey: 'audit',
    },
    {
      title: "Analytics",
      url: "/analytics",
      icon: BarChart3,
      visible: permissions.canViewAnalytics,
      routeKey: 'analytics',
    },
    {
      title: "Comisiones",
      url: "/comisiones",
      icon: HandCoins,
      // El acceso operativo sigue bloqueado en la página hasta que exista una
      // configuración activa; mantener el ítem visible evita que el módulo
      // parezca ausente mientras se completa esa configuración.
      visible: permissions.canViewCommissions,
      routeKey: 'commissions',
    },
    {
      title: "Incidencias",
      url: "/incidents",
      icon: AlertCircle,
      visible: true,
      routeKey: 'incidents',
    },
    {
      title: "Mi Perfil",
      url: "/profile",
      icon: User,
      visible: true,
      routeKey: 'profile',
    },
  ]);

  const adminItems = applyMenuConfig([
    {
      title: "Usuarios",
      url: "/users",
      icon: UserCog,
      visible: permissions.canViewUsers,
      routeKey: 'users',
    },
    {
      title: "Empresas",
      url: "/companies",
      icon: Building2,
      visible: permissions.canViewCompanies,
      routeKey: 'companies',
    },
    {
      title: "Configuración",
      url: "/settings",
      icon: Settings,
      visible: permissions.canViewSettings,
      routeKey: 'settings',
    }
  ]);

  const allMenuItems = [...menuItems, ...adminItems];

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="px-2 py-4">
          {logoUrl && !logoBroken ? (
            <div className="flex items-center gap-2">
              <img
                src={logoUrl}
                alt={companyName}
                className="h-8 max-w-[120px] object-contain"
                onError={() => setLogoBroken(true)}
              />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground tracking-tight truncate">
                  {companyName || 'SAMAP Digital'}
                </h2>
                <p className="text-xs text-muted-foreground">Gestión comercial médica</p>
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-foreground tracking-tight">
                {companyName || 'SAMAP Digital'}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">Gestión comercial médica</p>
            </>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {allMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location.pathname === item.url}>
                    <Link to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="p-2">
          <LogoutButton />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
