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

type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  descriptors?: unknown;
  navigation: { emit: (e: { type: string; target: string; canPreventDefault: boolean }) => { defaultPrevented: boolean }; navigate: (name: string) => void };
};

const TAB_CONFIG = [
  { name: "index",        label: "POS",         icon: "◈", color: "#10B981", shadow: "#10B981" },
  { name: "dashboard",    label: "Dashboard",   icon: "◉", color: "#3B82F6", shadow: "#3B82F6" },
  { name: "transactions", label: "Ledger",      icon: "◧", color: "#8B5CF6", shadow: "#8B5CF6" },
  { name: "inventory",    label: "Stock",       icon: "◫", color: "#F59E0B", shadow: "#F59E0B" },
  { name: "more",         label: "More",        icon: "⋯", color: "#EC4899", shadow: "#EC4899" },
];

const TAB_ICONS: Record<string, { active: string; inactive: string }> = {
  index:        { active: "⚡", inactive: "⚡" },
  dashboard:    { active: "◈", inactive: "◈" },
  transactions: { active: "☰", inactive: "☰" },
  inventory:    { active: "⬡", inactive: "⬡" },
  more:         { active: "•••", inactive: "•••" },
};

function CustomTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const isDark = useColorScheme() === "dark";
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";

  const bg = isDark ? "#0F172A" : "#FFFFFF";
  const border = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)";

  return (
    <View style={[
      styles.tabBar,
      {
        paddingBottom: isWeb ? 12 : Math.max(insets.bottom, 8),
        backgroundColor: isIOS ? "transparent" : bg,
        borderTopColor: border,
      }
    ]}>
      {isIOS && (
        <BlurView
          intensity={90}
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
            android_ripple={{ color: tab.color + "22", borderless: true }}
          >
            {isFocused ? (
              <View style={[styles.activePill, { backgroundColor: tab.color + "18", borderColor: tab.color + "40" }]}>
                <View style={[styles.iconDot, { backgroundColor: tab.color }]}>
                  <Text style={styles.iconDotText}>{TAB_ICONS[route.name]?.active ?? "●"}</Text>
                </View>
                <Text style={[styles.activeLabel, { color: tab.color }]}>{tab.label}</Text>
              </View>
            ) : (
              <View style={styles.inactiveTab}>
                <Text style={[styles.inactiveIcon, { color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)" }]}>
                  {TAB_ICONS[route.name]?.inactive ?? "●"}
                </Text>
                <Text style={[styles.inactiveLabel, { color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)" }]}>
                  {tab.label}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
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
      tabBar={(props) => <CustomTabBar {...props} />}
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
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  activePill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 10,
    gap: 6,
    borderWidth: 1,
  },
  iconDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  iconDotText: {
    fontSize: 10,
    color: "#FFF",
    fontFamily: "Inter_700Bold",
  },
  activeLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
  },
  inactiveTab: {
    alignItems: "center",
    gap: 3,
    paddingVertical: 4,
  },
  inactiveIcon: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  inactiveLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
  },
});
