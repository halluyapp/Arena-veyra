import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import QRCode from "react-native-qrcode-svg";
import { request, configured, ApiError } from "./api";
import { safeHttps } from "./domain";
import { Button, styles } from "./ui";
// These endpoints are a deferred backend contract, not a local pairing bypass.
export function Activation({ onAuthorized }: { onAuthorized: () => void }) {
  const [challenge, setChallenge] = useState<{
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    expires: number;
    interval: number;
  }>();
  const [error, setError] = useState("");
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const start = async () => {
      setError("");
      setChallenge(undefined);
      try {
        const token = await SecureStore.getItemAsync("veyra-device-token");
        if (token) {
          try {
            const session = await request(
              "/devices/session",
              {},
              { signal: controller.signal },
            );
            if (session.authorized === true) {
              onAuthorized();
              return;
            }
          } catch (e) {
            if (!(e instanceof ApiError) || ![401, 403].includes(e.status))
              throw e;
          }
          await SecureStore.deleteItemAsync("veyra-device-token");
        }
        const data = await request(
          "/devices/activation",
          {},
          {
            method: "POST",
            body: { platform: "android-tv" },
            authenticated: false,
            signal: controller.signal,
          },
        );
        if (
          !data.deviceCode ||
          !data.userCode ||
          !Number.isFinite(data.expiresIn) ||
          data.expiresIn <= 0
        )
          throw new Error("Activation is not available yet.");
        const value = {
          deviceCode: data.deviceCode,
          userCode: data.userCode,
          verificationUri: safeHttps(data.verificationUriComplete),
          expires: Date.now() + data.expiresIn * 1000,
          interval: Math.max(5000, Number(data.interval || 5) * 1000),
        };
        if (controller.signal.aborted) return;
        setChallenge(value);
        const poll = async () => {
          if (controller.signal.aborted) return;
          if (Date.now() >= value.expires) {
            setChallenge(undefined);
            setError("This code expired. Request a new code.");
            return;
          }
          if (AppState.currentState !== "active") {
            timer = setTimeout(poll, value.interval);
            return;
          }
          try {
            const result = await request(
              "/devices/activation/status",
              {},
              {
                method: "POST",
                body: { deviceCode: value.deviceCode },
                authenticated: false,
                signal: controller.signal,
              },
            );
            if (
              result.status === "approved" &&
              typeof result.accessToken === "string"
            ) {
              await SecureStore.setItemAsync(
                "veyra-device-token",
                result.accessToken,
              );
              const session = await request(
                "/devices/session",
                {},
                { signal: controller.signal },
              );
              if (session.authorized !== true)
                throw new Error("Activation could not be verified.");
              if (!controller.signal.aborted) onAuthorized();
              return;
            }
            if (["denied", "expired"].includes(result.status))
              throw new Error(
                "Activation was declined or expired. Request a new code.",
              );
            if (result.status === "slow_down") value.interval += 5000;
            timer = setTimeout(poll, value.interval);
          } catch (e) {
            if (controller.signal.aborted) return;
            if (
              e instanceof ApiError &&
              (e.status === 429 || e.status >= 500 || e.status === 0)
            ) {
              value.interval = Math.min(60000, value.interval + 5000);
              timer = setTimeout(poll, value.interval);
            } else {
              setChallenge(undefined);
              setError(e instanceof Error ? e.message : "Activation failed.");
            }
          }
        };
        timer = setTimeout(poll, value.interval);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Activation is unavailable.",
          );
      }
    };
    void start();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [generation, onAuthorized]);
  return (
    <View style={[styles.fill, styles.center, { padding: 64 }]}>
      <Text style={styles.brand}>VEYRA</Text>
      <Text style={styles.heroTitle}>Your screen. Your world.</Text>
      <Text style={styles.subtitle}>Activate this TV with your phone</Text>
      {challenge ? (
        <View style={[styles.row, { gap: 48, marginVertical: 24 }]}>
          <View
            style={{ padding: 20, backgroundColor: "#fff", borderRadius: 16 }}
          >
            <QRCode value={challenge.verificationUri} size={220} />
          </View>
          <View style={{ maxWidth: 420 }}>
            <Text style={styles.heading}>Scan. Sign in. Approve.</Text>
            <Text style={styles.body}>
              Scan the QR code with your phone and approve this TV. Never share
              this code with someone you do not trust.
            </Text>
            <Text selectable style={[styles.heroTitle, { letterSpacing: 6 }]}>
              {challenge.userCode}
            </Text>
            <Text selectable style={styles.muted}>
              {new URL(challenge.verificationUri).origin}
            </Text>
          </View>
        </View>
      ) : error ? (
        <Text style={[styles.body, { maxWidth: 640 }]}>{error}</Text>
      ) : (
        <ActivityIndicator color="#e5093f" size="large" />
      )}
      {!configured && (
        <Text style={styles.muted}>
          The activation backend has not been configured. TV access remains
          locked.
        </Text>
      )}
      {error ? (
        <Button
          label="Try again"
          onPress={() => setGeneration((g) => g + 1)}
          primary
        />
      ) : null}
    </View>
  );
}
