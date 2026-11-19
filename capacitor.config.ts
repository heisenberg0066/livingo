import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.livingo.pair",
  appName: "Livingo",
  webDir: "dist",
  android: {
    allowMixedContent: true,
  },
  plugins: {
    LocalNotifications: {
      iconColor: "#2fbe6a",
    },
  },
};

export default config;
