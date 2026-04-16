import { create } from "zustand";

export interface LogEntry {
  id: string;
  timestamp: string;
  type: "command" | "info" | "success" | "error";
  message: string;
}

interface LogState {
  logs: LogEntry[];
  isExpanded: boolean;
  activeProcessCount: number;
  addLog: (type: LogEntry["type"], message: string) => void;
  clearLogs: () => void;
  setExpanded: (expanded: boolean) => void;
  incrementProcess: () => void;
  decrementProcess: () => void;
}

const initialLogs: LogEntry[] = [
  {
    id: "ui-shell-ready",
    timestamp: new Date().toLocaleTimeString(),
    type: "info",
    message: "RiboTE analysis interface is ready."
  }
];

export const useLogStore = create<LogState>((set) => ({
  logs: initialLogs,
  isExpanded: false,
  activeProcessCount: 0,
  addLog: (type, message) =>
    set((state) => ({
      logs: [
        ...state.logs,
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          type,
          message,
          timestamp: new Date().toLocaleTimeString()
        }
      ].slice(-500)
    })),
  clearLogs: () => set({ logs: [] }),
  setExpanded: (isExpanded) => set({ isExpanded }),
  incrementProcess: () =>
    set((state) => ({
      activeProcessCount: state.activeProcessCount + 1
    })),
  decrementProcess: () =>
    set((state) => ({
      activeProcessCount: Math.max(0, state.activeProcessCount - 1)
    }))
}));
