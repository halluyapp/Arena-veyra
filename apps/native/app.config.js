module.exports = {
  expo: {
    name: "VEYRA",
    slug: "veyra",
    scheme: "veyra",
    version: "1.0.0",
    icon: "./assets/icon.png",
    orientation: "default",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    android: {
      package: "com.veyra.stream",
      versionCode: 1,
      allowBackup: false,
      permissions: ["INTERNET", "POST_NOTIFICATIONS"],
      blockedPermissions: [
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
        "READ_MEDIA_VIDEO",
        "RECORD_AUDIO",
      ],
    },
    plugins: [
      [
        "@react-native-tvos/config-tv",
        {
          isTV: true,
          androidTVRequired: false,
          androidTVBanner: "./assets/tv-banner.png",
        },
      ],
      "expo-secure-store",
      ["react-native-video", { enableNotificationControls: true }],
      "@kesha-antonov/react-native-background-downloader",
      "./plugins/private-storage",
    ],
  },
};
