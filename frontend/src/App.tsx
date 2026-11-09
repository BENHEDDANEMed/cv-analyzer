// Routes de l'application et protection des pages privées.
import { Fragment, useEffect, type ReactNode } from "react";
import { AuthProvider, useAuth } from "./lib/auth";
import { matchPath, RouterProvider, useRouter } from "./lib/router";
import { ToastProvider } from "./components/toast";
import { Layout } from "./components/Layout";
import { Spinner } from "./components/ui";
import { LoginPage, RegisterPage } from "./pages/Auth";
import { DashboardPage } from "./pages/Dashboard";
import { NewAnalysisPage } from "./pages/NewAnalysis";
import { AnalysisDetailPage } from "./pages/AnalysisDetail";
import { HistoryPage } from "./pages/History";
import { LabExtractionPage } from "./pages/LabExtraction";
import { LabComparePage } from "./pages/LabCompare";
import { LabWeightsPage } from "./pages/LabWeights";
import { DictionaryPage } from "./pages/Dictionary";
import { ProfilePage } from "./pages/Profile";
import { NotFoundPage } from "./pages/NotFound";

const PUBLIC_ROUTES: Record<string, () => ReactNode> = {
  "/connexion": () => <LoginPage />,
  "/inscription": () => <RegisterPage />,
};

const PRIVATE_ROUTES: [string, (p: Record<string, string>) => ReactNode][] = [
  ["/", () => <DashboardPage />],
  ["/analyses/nouvelle", () => <NewAnalysisPage />],
  ["/analyses/:id", (p) => <AnalysisDetailPage id={Number(p.id)} />],
  ["/historique", () => <HistoryPage />],
  ["/laboratoire/extraction", () => <LabExtractionPage />],
  ["/laboratoire/comparateur", () => <LabComparePage />],
  ["/laboratoire/poids", () => <LabWeightsPage />],
  ["/dictionnaire", () => <DictionaryPage />],
  ["/profil", () => <ProfilePage />],
];

function Redirect({ to }: { to: string }) {
  const { navigate } = useRouter();
  useEffect(() => navigate(to, { replace: true }), [to, navigate]);
  return null;
}

function Routes() {
  const { path } = useRouter();
  const { user, loading } = useAuth();

  if (loading) return <Spinner label="Chargement de la session" />;

  const publicRoute = PUBLIC_ROUTES[path];
  if (publicRoute) return user ? <Redirect to="/" /> : <>{publicRoute()}</>;

  if (!user) {
    const next = path !== "/" ? `?suite=${encodeURIComponent(path)}` : "";
    return <Redirect to={`/connexion${next}`} />;
  }

  for (const [pattern, render] of PRIVATE_ROUTES) {
    const params = matchPath(pattern, path);
    if (params && !(pattern === "/analyses/:id" && !/^\d+$/.test(params.id))) {
      return <Layout><Fragment key={path}>{render(params)}</Fragment></Layout>;
    }
  }
  return <Layout><NotFoundPage /></Layout>;
}

export function App() {
  return (
    <RouterProvider>
      <AuthProvider>
        <ToastProvider>
          <Routes />
        </ToastProvider>
      </AuthProvider>
    </RouterProvider>
  );
}
