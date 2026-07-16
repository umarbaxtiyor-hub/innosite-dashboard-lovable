import { Outlet, Link, createRootRoute, HeadContent, Scripts, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileTopNav } from "@/components/MobileTopNav";
import { PwaInstaller } from "@/components/PwaInstaller";

import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { useCurrentRoles } from "@/hooks/use-current-roles";
import { canAccessPath } from "@/lib/permissions";
import { usePermissionMatrix } from "@/hooks/use-permission-matrix";

import { ActiveProjectProvider } from "@/lib/project-context";
import { Toaster } from "@/components/ui/sonner";
import { PullToRefresh } from "@/components/PullToRefresh";


import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
    <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Sahifa topilmadi</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Siz qidirayotgan sahifa mavjud emas yoki ko'chirilgan.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Bosh sahifaga qaytish
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "innosite construction projects management" },
      {
        name: "description",
        content:
          "BOQ asosida qurilish loyihasi nazorati: byudjet/fakt, materiallar, ish bajarilishi, xarajatlar va qo'shimcha ishlar.",
      },
      { property: "og:title", content: "innosite construction projects management" },
      { name: "twitter:title", content: "innosite construction projects management" },
      { name: "description", content: "Construction project management dashboard for tracking materials, work progress, expenses, and variations." },
      { property: "og:description", content: "Construction project management dashboard for tracking materials, work progress, expenses, and variations." },
      { name: "twitter:description", content: "Construction project management dashboard for tracking materials, work progress, expenses, and variations." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/55e6b4b1-7295-421a-b9e7-e3da93844e1f/id-preview-51512ccf--6ca67d43-c1ef-4bc2-9166-54a51970bdbd.lovable.app-1777858466170.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/55e6b4b1-7295-421a-b9e7-e3da93844e1f/id-preview-51512ccf--6ca67d43-c1ef-4bc2-9166-54a51970bdbd.lovable.app-1777858466170.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
      { name: "theme-color", content: "#0F172A" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Innosite" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800;900&display=swap" },
    ],

  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz-Latn-UZ" className="light">
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('app-theme')||'light';var r=document.documentElement;r.classList.remove('light','dark');r.classList.add(t);}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}


function RootComponent() {
  const [qc] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
      },
    },
  }));
  return (
    <QueryClientProvider client={qc}>
      <AuthGate>
        {(authed) => authed ? (
        <ActiveProjectProvider>
          <SidebarProvider>
            <div className="flex min-h-screen w-full bg-background">
              <div className="hidden md:block">
                <AppSidebar />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <header className="sticky top-0 z-10 flex h-16 items-center gap-2 border-b border-border bg-background/80 px-2 backdrop-blur sm:px-5">
                  <div className="hidden md:block">
                    <SidebarTrigger />
                  </div>
                  <Link to="/" className="flex items-baseline gap-0 select-none leading-none" aria-label="Innosite">
                    <span className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">inn</span>
                    <span className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: "#F97316" }}>o</span>
                    <span className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">site</span>
                  </Link>
                  <div className="ml-auto flex items-center gap-2">
                    <ThemeToggle />
                    <Link to="/auth" className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">Kirish</Link>
                  </div>
                </header>
                <main className="flex-1 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-0">
                  <PullToRefresh>
                    <RoleGate>
                      <Outlet />
                    </RoleGate>
                  </PullToRefresh>
                </main>
                <div className="md:hidden fixed bottom-0 inset-x-0 z-[110]">
                  <MobileTopNav />
                </div>
              </div>
              <Toaster />
              <PwaInstaller />
            </div>
          </SidebarProvider>
        </ActiveProjectProvider>
        ) : (
          <div className="min-h-screen w-full bg-background">
            <Outlet />
            <Toaster />
          </div>
        )}
      </AuthGate>
    </QueryClientProvider>
  );
}

function RoleGate({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { roles, loading } = useCurrentRoles();
  const { matrix, loading: matrixLoading } = usePermissionMatrix();
  if (PUBLIC_ROUTES.has(pathname)) return <>{children}</>;
  if (loading || matrixLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!canAccessPath(pathname, roles, matrix)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 px-4 text-center">
        <h2 className="text-xl font-semibold">Ruxsat yo'q</h2>
        <p className="text-sm text-muted-foreground">
          Sizning rollaringizda bu sahifaga kirishga ruxsat berilmagan.
        </p>
        <Link to="/" className="mt-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
          Bosh sahifaga
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}


const PUBLIC_ROUTES = new Set<string>(["/auth", "/tg/miniapp"]);

function AuthGate({ children }: { children: (authed: boolean) => React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "authed" | "guest">("loading");

  useEffect(() => {
    let active = true;
    const SESSION_FLAG = "innosite.session.active";
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!active) return;
      if (session?.user) {
        try { sessionStorage.setItem(SESSION_FLAG, "1"); } catch {}
        setStatus("authed");
      } else {
        try { sessionStorage.removeItem(SESSION_FLAG); } catch {}
        setStatus("guest");
      }
    });
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const hasFlag = (() => { try { return sessionStorage.getItem(SESSION_FLAG) === "1"; } catch { return false; } })();
        if (data.session?.user && !hasFlag) {
          await supabase.auth.signOut();
          if (active) setStatus("guest");
          return;
        }
        if (active) setStatus(data.session?.user ? "authed" : "guest");
      } catch {
        if (active) setStatus("guest");
      }
    })();
    const fallback = window.setTimeout(() => {
      if (active) setStatus((current) => current === "loading" ? "guest" : current);
    }, 3000);
    return () => {
      active = false;
      window.clearTimeout(fallback);
      sub.subscription.unsubscribe();
    };
  }, []);

  const isPublic = PUBLIC_ROUTES.has(pathname);

  useEffect(() => {
    if (status === "guest" && !isPublic) {
      navigate({ to: "/auth" });
    }
  }, [status, isPublic, navigate]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (status === "guest" && !isPublic) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return <>{children(status === "authed")}</>;
}
