import React from "react";
import { HashRouter, Routes, Route, BrowserRouter } from "react-router-dom";
import Navbar from "./components/Navbar";
import WorldHeatmap from "./components/WorldHeatMap";
import StatisticsPage from "./pages/StatisticsPage";

type AppRouterProps = {
  markElement: React.ReactNode;
  mapsElement?: React.ReactNode;
  statisticsElement?: React.ReactNode;
};

export default function AppRouter({ markElement, mapsElement, statisticsElement }: AppRouterProps) {
  return (
    <HashRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={markElement} />
        <Route path="/maps" element={mapsElement ?? <div style={{ padding: 24 }}><h2>Maps</h2><WorldHeatmap /></div>} />
        <Route path="/statistics" element={statisticsElement ?? <StatisticsPage />} />
      </Routes>
    </HashRouter>
  );
}
