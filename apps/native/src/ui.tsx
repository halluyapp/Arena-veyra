import React, { useState } from "react";
import {
  Pressable,
  Text,
  StyleSheet,
  View,
  ActivityIndicator,
} from "react-native";
export function Button({
  label,
  onPress,
  primary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary && styles.primary,
        focused && styles.focus,
        (pressed || disabled) && { opacity: 0.55 },
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}
export function Message({
  title,
  text,
  retry,
  loading,
}: {
  title: string;
  text?: string;
  retry?: () => void;
  loading?: boolean;
}) {
  return (
    <View style={[styles.center, { padding: 32, gap: 18 }]}>
      {loading && <ActivityIndicator color="#e5093f" size="large" />}
      <Text style={styles.heading}>{title}</Text>
      {text && (
        <Text style={[styles.muted, { textAlign: "center" }]}>{text}</Text>
      )}
      {retry && <Button label="Try again" onPress={retry} primary />}
    </View>
  );
}
export const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#090909" },
  center: { justifyContent: "center", alignItems: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  brand: {
    color: "#f5f4f0",
    letterSpacing: 5,
    fontSize: 24,
    fontWeight: "900",
    marginVertical: 18,
  },
  heroTitle: {
    color: "#f5f4f0",
    fontSize: 38,
    fontWeight: "800",
    marginVertical: 12,
  },
  heading: {
    color: "#f5f4f0",
    fontSize: 23,
    fontWeight: "700",
    marginVertical: 12,
  },
  subtitle: { color: "#c4c4c8", fontSize: 20, marginVertical: 10 },
  body: { color: "#dedee1", fontSize: 16, lineHeight: 25, marginVertical: 10 },
  muted: { color: "#96969b", fontSize: 14, lineHeight: 22 },
  button: {
    borderRadius: 12,
    backgroundColor: "#202020",
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderWidth: 2,
    borderColor: "transparent",
    marginVertical: 4,
  },
  primary: { backgroundColor: "#e5093f" },
  focus: {
    borderColor: "#fff",
    backgroundColor: "#a50732",
    transform: [{ scale: 1.025 }],
  },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  input: {
    color: "#fff",
    backgroundColor: "#171717",
    borderColor: "#393939",
    borderWidth: 1,
    padding: 16,
    borderRadius: 12,
    fontSize: 17,
  },
  panel: {
    backgroundColor: "#141414",
    padding: 20,
    borderRadius: 16,
    marginVertical: 8,
  },
});
