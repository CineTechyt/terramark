import React from "react";
import { BrowserRouter, Routes, Route, HashRouter } from "react-router-dom";
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
      <Route path="/maps" element={mapsElement} />
      <Route path="/statistics" element={statisticsElement} />
    </Routes>
  </HashRouter>

  );
}
