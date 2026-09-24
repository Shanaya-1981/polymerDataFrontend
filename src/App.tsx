import { lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ThemeProvider } from "@/components/theme";
import { ImportedDataProvider } from "@/contexts";

const Home = lazy(() => import("@/pages/Home"));
const Explore = lazy(() => import("@/pages/Explore"));
const Temperature = lazy(() => import("@/pages/Temperature"));
const Correlations = lazy(() => import("@/pages/Correlations"));
const DataTable = lazy(() => import("@/pages/DataTable"));
const Features = lazy(() => import("@/pages/Features"));
const About = lazy(() => import("@/pages/About"));
const NotFound = lazy(() => import("@/pages/NotFound"));

export function App() {
  return (
    <ThemeProvider>
      {/* Above the router so an imported CSV outlives the Explore route. */}
      <ImportedDataProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Home />} />
              <Route path="explore" element={<Explore />} />
              <Route path="temperature" element={<Temperature />} />
              <Route path="correlations" element={<Correlations />} />
              <Route path="data" element={<DataTable />} />
              <Route path="features" element={<Features />} />
              <Route path="about" element={<About />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ImportedDataProvider>
    </ThemeProvider>
  );
}
