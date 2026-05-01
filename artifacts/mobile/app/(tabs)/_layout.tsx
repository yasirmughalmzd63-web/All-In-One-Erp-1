import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Label, NativeTabs } from "expo-router/unstable-native-tabs";
import React from "react";
import {
  Platform, Pressable, StyleSheet, Text, View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

type FeatherName = React.ComponentProps<typeof Feather>["name"];

type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  descriptors?: unknown;
  navigation: { emit: (e: { type: string; target: string; canPreventDefault: boolean }) => { defaultPrevented: boolean }; navigate: (name: string) => void };
};

const TAB_CONFIG: { name: string; label: string; icon: FeatherName; color: string }[] = [
  { name: "index",        label: "POS",       icon: "shopping-bag",  color: "#10B981" },
  { name: "dashboard",    label: "Dashboard", icon: "pie-chart",     color: "#3B82F6" },
  { name: "transactions", label: "Ledger",    icon: "list",          color: "#8B5CF6" },
  { name: "inventory",    label: "Stock",     icon: "package",       color: "#F59E0B" },
  { name: "more",         label: "More",      icon: "grid",          color: "#EC4899" },
];

function CustomTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const isDark = useColorScheme() === "dark";
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";

  const bg = isDark ? "rgba(15,23,42,0.96)" : "rgba(255,255,255,0.96)";
  const border = isDark ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.06)";
  const inactiveColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(15,23,42,0.45)";

  return (
    <View style={[
      styles.tabBarWrap,
      { paddingBottom: isWeb ? 10 : Math.max(insets.bottom, 8) },
    ]}>
      <View style={[
        styles.tabBar,
        {
          backgroundColor: isIOS ? "transparent" : bg,
          borderTopColor: border,
        }
      ]}>
        {isIOS && (
          <BlurView
            intensity={80}
            tint={isDark ? "dark" : "light"}
            style={StyleSheet.absoluteFill}
          />
        )}
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const tab = TAB_CONFIG.find(t => t.name === route.name) ?? TAB_CONFIG[index]!;

          const onPress = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={styles.tabItem}
              android_ripple={{ color: tab.color + "1F", borderless: true, radius: 36 }}
            >
              {isFocused ? (
                <View style={[styles.activePill, { backgroundColor: tab.color + "16" }]}>
                  <Feather name={tab.icon} size={18} color={tab.color} />
                  <Text style={[styles.activeLabel, { color: tab.color }]}>
                    {tab.label}
                  </Text>
                </View>
              ) : (
                <View style={styles.inactiveTab}>
                  <Feather name={tab.icon} size={20} color={inactiveColor} />
                  <Text style={[styles.inactiveLabel, { color: inactiveColor }]}>
                    {tab.label}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index"><Label>POS</Label></NativeTabs.Trigger>
      <NativeTabs.Trigger name="dashboard"><Label>Dashboard</Label></NativeTabs.Trigger>
      <NativeTabs.Trigger name="transactions"><Label>Ledger</Label></NativeTabs.Trigger>
      <NativeTabs.Trigger name="inventory"><Label>Stock</Label></NativeTabs.Trigger>
      <NativeTabs.Trigger name="more"><Label>More</Label></NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...(props as unknown as TabBarProps)} />}
    >
      <Tabs.Screen name="index"        options={{ title: "POS" }} />
      <Tabs.Screen name="dashboard"    options={{ title: "Dashboard" }} />
      <Tabs.Screen name="transactions" options={{ title: "Ledger" }} />
      <Tabs.Screen name="inventory"    options={{ title: "Stock" }} />
      <Tabs.Screen name="more"         options={{ title: "More" }} />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}

const styles = StyleSheet.create({
  tabBarWrap: {
    backgroundColor: "transparent",
  },
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 8,
    paddingHorizontal: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    paddingHorizontal: 2,
    minHeight: 52,
  },
  activePill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 22,
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 7,
  },
  activeLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 0.1,
  },
  inactiveTab: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  inactiveLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10.5,
    letterSpacing: 0.1,
  },
});
