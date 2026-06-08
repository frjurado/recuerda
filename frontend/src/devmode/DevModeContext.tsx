import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const DEV_MODE_KEY = "recuerda_dev_mode";

type DevModeState = {
  devMode: boolean;
  toggleDevMode: () => void;
};

const DevModeContext = createContext<DevModeState | undefined>(undefined);

async function loadDevMode(): Promise<boolean> {
  if (Platform.OS === "web") {
    try {
      return window.localStorage.getItem(DEV_MODE_KEY) === "1";
    } catch {
      return false;
    }
  }
  return (await SecureStore.getItemAsync(DEV_MODE_KEY)) === "1";
}

async function saveDevMode(value: boolean) {
  if (Platform.OS === "web") {
    try {
      if (value) window.localStorage.setItem(DEV_MODE_KEY, "1");
      else window.localStorage.removeItem(DEV_MODE_KEY);
    } catch {}
    return;
  }
  if (value) await SecureStore.setItemAsync(DEV_MODE_KEY, "1");
  else await SecureStore.deleteItemAsync(DEV_MODE_KEY);
}

export function DevModeProvider({ children }: { children: React.ReactNode }) {
  const [devMode, setDevMode] = useState(false);

  useEffect(() => {
    loadDevMode().then(setDevMode);
  }, []);

  const toggleDevMode = () => {
    setDevMode((prev) => {
      const next = !prev;
      saveDevMode(next);
      return next;
    });
  };

  return (
    <DevModeContext.Provider value={{ devMode, toggleDevMode }}>
      {children}
    </DevModeContext.Provider>
  );
}

export function useDevMode() {
  const ctx = useContext(DevModeContext);
  if (!ctx) throw new Error("useDevMode must be used inside DevModeProvider");
  return ctx;
}
