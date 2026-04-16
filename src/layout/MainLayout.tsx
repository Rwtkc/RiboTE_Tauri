import { useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import { ChevronDown, LayoutGrid } from "lucide-react";
import logoSrc from "@/logo.webp";
import { ConsoleDock } from "@/components/shared/ConsoleDock";
import { findModuleDefinition, riboteModuleCatalog } from "@/data/moduleCatalog";
import { useAppStore } from "@/store/useAppStore";
import { useLogStore } from "@/store/useLogStore";

interface MainLayoutProps {
  activeModule: string;
  onModuleChange: (moduleId: string) => void;
  children: ReactNode;
}

export function MainLayout({
  activeModule,
  onModuleChange,
  children
}: MainLayoutProps) {
  const { activeProcessCount } = useLogStore();
  const activeNavChildren = useAppStore((state) => state.activeModuleNavChildren);
  const setActiveModuleNavChild = useAppStore((state) => state.setActiveModuleNavChild);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const activeItem = useMemo(
    () => findModuleDefinition(activeModule),
    [activeModule]
  );

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar__brand">
          <img className="app-sidebar__brand-icon" src={logoSrc} alt="" />
          <span className="app-sidebar__wordmark">
            <span>Ribo</span>
            <span className="app-sidebar__wordmark-accent">TE</span>
          </span>
        </div>

        <nav className="app-sidebar__nav">
          {riboteModuleCatalog.map((module) => {
            const Icon = module.icon;
            if (module.navChildren?.length) {
              const isOpen = openGroups[module.id] ?? activeModule === module.id;
              const activeChild = activeNavChildren[module.id] ?? module.navChildren[0]?.id;
              const firstChildId = module.navChildren[0]?.id;
              const triggerIsActive = activeModule === module.id && activeChild !== firstChildId;
              return (
                <div key={module.id} className={clsx("nav-group", { "is-open": isOpen })}>
                  <button
                    type="button"
                    className={clsx("nav-item", "nav-item--group-trigger", {
                      "is-active": triggerIsActive
                    })}
                    onClick={() => {
                      onModuleChange(module.id);
                      setOpenGroups((current) => ({
                        ...current,
                        [module.id]: !(current[module.id] ?? activeModule === module.id)
                      }));
                    }}
                  >
                    <span className="nav-item__rail" />
                    <span className="nav-item__content">
                      <Icon size={16} />
                      <span>{module.label}</span>
                    </span>
                    <ChevronDown size={14} className="nav-group__chevron" />
                  </button>
                  <div className="nav-group__children" aria-hidden={!isOpen}>
                    <div className="nav-group__children-inner">
                      {module.navChildren.map((child) => (
                        <button
                          key={child.id}
                          type="button"
                          className={clsx("nav-subitem", {
                            "is-active": activeModule === module.id && activeChild === child.id
                          })}
                          tabIndex={isOpen ? 0 : -1}
                          onClick={() => {
                            setActiveModuleNavChild(module.id, child.id);
                            setOpenGroups((current) => ({
                              ...current,
                              [module.id]: true
                            }));
                            onModuleChange(module.id);
                          }}
                        >
                          <span>{child.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <button
                key={module.id}
                type="button"
                className={clsx("nav-item", {
                  "is-active": activeModule === module.id
                })}
                onClick={() => onModuleChange(module.id)}
              >
                <span className="nav-item__rail" />
                <span className="nav-item__content">
                  <Icon size={16} />
                  <span>{module.label}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="app-sidebar__status">
          <span className={clsx("status-dot", { "is-busy": activeProcessCount > 0 })} />
          {activeProcessCount > 0 ? "Analysis Running" : "Ready for Analysis"}
        </div>
      </aside>

      <div className="app-workspace">
        <header className="app-workspace__header">
          <div className="workspace-breadcrumb">
            <LayoutGrid size={12} />
            <span>Analysis / </span>
            <strong>{activeItem.label}</strong>
          </div>
        </header>

        <main className="app-workspace__main">
          <div className="app-workspace__inner">{children}</div>
        </main>

        <ConsoleDock />
      </div>
    </div>
  );
}
