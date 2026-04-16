import { useEffect, useState } from "react";
import { MainLayout } from "@/layout/MainLayout";
import { LoadingScreen } from "@/components/shared/LoadingScreen";
import { ConfiguredAnalysisModule } from "@/modules/Analysis/ConfiguredAnalysisModule";
import { DataPreprocessModule } from "@/modules/DataPreprocess/DataPreprocessModule";
import { CodonModule } from "@/modules/Codon/CodonModule";
import { HelpModule } from "@/modules/Help/HelpModule";
import { LoadDataModule } from "@/modules/LoadData/LoadDataModule";
import { TranslationEfficiencyModule } from "@/modules/TranslationEfficiency/TranslationEfficiencyModule";
import { WelcomeModule } from "@/modules/Welcome/WelcomeModule";
import { WorkspaceModule } from "@/modules/Workspace/WorkspaceModule";
import { findModuleDefinition } from "@/data/moduleCatalog";
import { useAppStore } from "@/store/useAppStore";

const configuredAnalysisModules = new Set(["pca", "clustering", "gsea", "enrichment", "network", "signalp"]);

function App() {
  const activeModule = useAppStore((state) => state.activeModule);
  const setActiveModule = useAppStore((state) => state.setActiveModule);
  const [isBooting, setIsBooting] = useState(true);
  const activeDefinition = findModuleDefinition(activeModule);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsBooting(false);
    }, 900);

    return () => window.clearTimeout(timer);
  }, []);

  if (isBooting) {
    return <LoadingScreen />;
  }

  return (
    <MainLayout activeModule={activeModule} onModuleChange={setActiveModule}>
      {activeModule === "welcome" ? (
        <WelcomeModule onNavigate={setActiveModule} />
      ) : activeModule === "load_data" ? (
        <LoadDataModule />
      ) : activeModule === "data_preprocess" ? (
        <DataPreprocessModule module={activeDefinition} />
      ) : activeModule === "translation_efficiency" ? (
        <TranslationEfficiencyModule module={activeDefinition} />
      ) : activeModule === "codon" ? (
        <CodonModule module={activeDefinition} />
      ) : configuredAnalysisModules.has(activeModule) ? (
        <ConfiguredAnalysisModule module={activeDefinition} />
      ) : activeModule === "help" ? (
        <HelpModule module={activeDefinition} />
      ) : (
        <WorkspaceModule module={activeDefinition} />
      )}
    </MainLayout>
  );
}

export default App;
