import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setBaseUrl } from "@workspace/api-client-react";
import { Redirect, Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/context/AuthContext";

setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
});

function RootLayoutNav() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === "login" || segments[0] === "register";
    if (!user && !inAuthGroup) {
      router.replace("/login");
    } else if (user && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [user, isLoading, segments]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#1E40AF", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#FFFFFF" size="large" />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ headerShown: false }} />
      <Stack.Screen name="customer-profile" options={{ headerShown: false }} />
      <Stack.Screen name="cash-management" options={{ headerShown: false }} />
      <Stack.Screen name="dollar-statement" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="customers" options={{ title: "Customers", headerStyle: { backgroundColor: "#1E40AF" }, headerTintColor: "#FFFFFF", headerTitleStyle: { fontFamily: "Inter_600SemiBold" } }} />
      <Stack.Screen name="suppliers" options={{ title: "Suppliers", headerStyle: { backgroundColor: "#1E40AF" }, headerTintColor: "#FFFFFF", headerTitleStyle: { fontFamily: "Inter_600SemiBold" } }} />
      <Stack.Screen name="users" options={{ title: "Users", headerStyle: { backgroundColor: "#1E40AF" }, headerTintColor: "#FFFFFF", headerTitleStyle: { fontFamily: "Inter_600SemiBold" } }} />
      <Stack.Screen name="locations" options={{ title: "Apps", headerStyle: { backgroundColor: "#1E40AF" }, headerTintColor: "#FFFFFF", headerTitleStyle: { fontFamily: "Inter_600SemiBold" } }} />
      <Stack.Screen name="accounts" options={{ title: "Accounts", headerStyle: { backgroundColor: "#1E40AF" }, headerTintColor: "#FFFFFF", headerTitleStyle: { fontFamily: "Inter_600SemiBold" } }} />
      <Stack.Screen name="categories" options={{ title: "Categories", headerStyle: { backgroundColor: "#1E40AF" }, headerTintColor: "#FFFFFF", headerTitleStyle: { fontFamily: "Inter_600SemiBold" } }} />
      <Stack.Screen name="wallets" options={{ title: "Wallets", headerStyle: { backgroundColor: "#1E40AF" }, headerTintColor: "#FFFFFF", headerTitleStyle: { fontFamily: "Inter_600SemiBold" } }} />
      <Stack.Screen name="audit" options={{ title: "Audit Log", headerStyle: { backgroundColor: "#1E40AF" }, headerTintColor: "#FFFFFF", headerTitleStyle: { fontFamily: "Inter_600SemiBold" } }} />
      <Stack.Screen name="credits" options={{ title: "Credits", headerStyle: { backgroundColor: "#1E40AF" }, headerTintColor: "#FFFFFF", headerTitleStyle: { fontFamily: "Inter_600SemiBold" } }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
