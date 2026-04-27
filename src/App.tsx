
import { lazy, Suspense, Component, ReactNode, type ComponentType } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SimpleAuthProvider } from "@/components/SimpleAuthProvider";
import { CompanyBrandingProvider } from "@/components/CompanyBrandingProvider";

// Helper: retry dynamic imports once then force-reload on chunk errors
function lazyRetry<T extends ComponentType<Record<string, unknown>>>(importFn: () => Promise<{ default: T }>) {
  return lazy(() =>
    importFn().catch((error: unknown) => {
      // If chunk failed to load, reload the page once
      const hasReloaded = sessionStorage.getItem('chunk_reload');
      if (!hasReloaded) {
        sessionStorage.setItem('chunk_reload', '1');
        window.location.reload();
        return new Promise(() => {}); // never resolves, page will reload
      }
      sessionStorage.removeItem('chunk_reload');
      throw error;
    })
  );
}

// Lazy-load components not needed for initial login page render
const SimpleProtectedRoute = lazyRetry(() => import("@/components/SimpleProtectedRoute").then(m => ({ default: m.SimpleProtectedRoute })));
const RoleProtectedRoute = lazyRetry(() => import("@/components/RoleProtectedRoute").then(m => ({ default: m.RoleProtectedRoute })));
const SimpleLoginForm = lazyRetry(() => import("@/components/SimpleLoginForm"));
const MainLayout = lazyRetry(() => import("@/layouts/MainLayout"));

// Lazy-loaded pages for code splitting — reduces initial bundle size
const Dashboard = lazyRetry(() => import("@/pages/Dashboard"));
const Sales = lazyRetry(() => import("@/pages/Sales"));
const NewSale = lazyRetry(() => import("@/pages/NewSale"));
const SaleDetail = lazyRetry(() => import("@/pages/SaleDetail"));
const SaleEdit = lazyRetry(() => import("@/pages/SaleEdit"));
const Clients = lazyRetry(() => import("@/pages/Clients"));
const Plans = lazyRetry(() => import("@/pages/Plans"));
const Documents = lazyRetry(() => import("@/pages/Documents"));
const Templates = lazyRetry(() => import("@/pages/Templates"));
const TemplateDetail = lazyRetry(() => import("@/pages/TemplateDetail"));
const TemplateEdit = lazyRetry(() => import("@/pages/TemplateEdit"));
const SignatureWorkflow = lazyRetry(() => import("@/pages/SignatureWorkflow"));
const Analytics = lazyRetry(() => import("@/pages/Analytics"));
const Incidents = lazyRetry(() => import("@/pages/Incidents"));
const IncidentNew = lazyRetry(() => import("@/pages/IncidentNew"));
const IncidentDetail = lazyRetry(() => import("@/pages/IncidentDetail"));
const Profile = lazyRetry(() => import("@/pages/Profile"));
const Users = lazyRetry(() => import("@/pages/Users"));
const Companies = lazyRetry(() => import("@/pages/Companies"));
const AuditDashboard = lazyRetry(() => import("@/pages/AuditDashboard"));
const Experience = lazyRetry(() => import("@/pages/Experience"));
const Settings = lazyRetry(() => import("@/pages/Settings"));
const SignatureView = lazyRetry(() => import("@/pages/SignatureView"));
const SignaturePolicy = lazyRetry(() => import("@/pages/SignaturePolicy"));
const Communications = lazyRetry(() => import("@/pages/Communications"));
const FileManagement = lazyRetry(() => import("@/pages/FileManagement"));
const PaymentSuccess = lazyRetry(() => import("@/pages/PaymentSuccess"));
const PaymentCanceled = lazyRetry(() => import("@/pages/PaymentCanceled"));
const QuestionnaireView = lazyRetry(() => import("@/pages/QuestionnaireView"));
const NotFound = lazyRetry(() => import("@/pages/NotFound"));

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4 text-center">
          <p className="text-lg font-semibold mb-2">Ocurrió un error inesperado.</p>
          <button
            className="mt-2 px-4 py-2 bg-primary text-white rounded"
            onClick={() => { sessionStorage.clear(); window.location.href = '/login'; }}
          >
            Volver al inicio
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Crear cliente de React Query con configuración optimizada
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

const App = () => {
  return (
    <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SimpleAuthProvider>
          <CompanyBrandingProvider>
            <Toaster />
            <BrowserRouter>
              <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Public routes */}
                <Route path="/" element={<SimpleLoginForm />} />
                <Route path="/login" element={<SimpleLoginForm />} />
                <Route path="/firmar/:token" element={<SignatureView />} />
                <Route path="/politica-firma" element={<SignaturePolicy />} />
                
                {/* Protected routes */}
                <Route
                  element={
                    <SimpleProtectedRoute>
                      <MainLayout />
                    </SimpleProtectedRoute>
                  } 
                >
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="sales" element={<Sales />} />
                  <Route path="sales/new" element={<NewSale />} />
                  <Route path="sales/:id" element={<SaleDetail />} />
                  <Route path="sales/:id/edit" element={<SaleEdit />} />
                  <Route path="clients" element={<Clients />} />
                  <Route path="plans" element={<Plans />} />
                  <Route path="documents" element={<Documents />} />
                  <Route path="templates" element={<Templates />} />
                  <Route path="templates/:id" element={<TemplateDetail />} />
                  <Route path="templates/:id/edit" element={<TemplateEdit />} />
                  <Route path="signature-workflow" element={<SignatureWorkflow />} />
                  <Route path="signature-workflow/:saleId" element={<SignatureWorkflow />} />
                  <Route path="analytics" element={<Analytics />} />
                  <Route path="incidents" element={<Incidents />} />
                  <Route path="incidents/new" element={<IncidentNew />} />
                  <Route path="incidents/:id" element={<IncidentDetail />} />
                  <Route path="profile" element={<Profile />} />
                  <Route
                    path="users"
                    element={
                      <RoleProtectedRoute allowedRoles={['super_admin', 'admin', 'supervisor']}>
                        <Users />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="companies"
                    element={
                      <RoleProtectedRoute allowedRoles={['super_admin']}>
                        <Companies />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="audit"
                    element={
                      <RoleProtectedRoute allowedRoles={['super_admin', 'admin', 'supervisor', 'auditor', 'vendedor']}>
                        <AuditDashboard />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route path="settings" element={<Settings />} />
                  <Route path="experience" element={<Experience />} />
                  <Route path="communications" element={<Communications />} />
                  <Route path="files" element={<FileManagement />} />
                  <Route path="payment/success" element={<PaymentSuccess />} />
                  <Route path="payment/canceled" element={<PaymentCanceled />} />
                  <Route path="questionnaire/:id" element={<QuestionnaireView />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
              </Suspense>
            </BrowserRouter>
          </CompanyBrandingProvider>
        </SimpleAuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
    </AppErrorBoundary>
  );
};

export default App;
