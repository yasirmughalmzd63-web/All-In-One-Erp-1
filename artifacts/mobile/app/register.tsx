import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator, Alert, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { customFetch } from "@workspace/api-client-react";

// ── Package definitions ──────────────────────────────────────────────────────
type PackageKey = "free" | "basic" | "professional" | "enterprise";

const PACKAGES: {
  key: PackageKey; name: string; price: string; tag: string;
  tagColor: string; tagBg: string; emoji: string;
  color: string; border: string; bg: string; isPaid: boolean;
  features: string[]; limits?: string;
}[] = [
  {
    key: "free",
    name: "Free Starter",
    price: "Free",
    tag: "FREE",
    tagColor: "#065F46",
    tagBg: "#D1FAE5",
    emoji: "🆓",
    color: "#1F2937",
    border: "#9CA3AF",
    bg: "rgba(255,255,255,0.06)",
    isPaid: false,
    features: ["POS & Basic Sales", "1 App / Location", "Up to 3 Products"],
    limits: "Limited — Upgrade anytime",
  },
  {
    key: "basic",
    name: "Basic",
    price: "₨999/mo",
    tag: "PAID",
    tagColor: "#92400E",
    tagBg: "#FEF3C7",
    emoji: "🟢",
    color: "#065F46",
    border: "#059669",
    bg: "rgba(5,150,105,0.08)",
    isPaid: true,
    features: ["POS & Sales", "Inventory Management", "Accounts & Apps", "Product Categories", "Credits (Customer)"],
  },
  {
    key: "professional",
    name: "Professional",
    price: "₨2,499/mo",
    tag: "POPULAR",
    tagColor: "#1E3A8A",
    tagBg: "#DBEAFE",
    emoji: "🔵",
    color: "#1E3A8A",
    border: "#2563EB",
    bg: "rgba(37,99,235,0.08)",
    isPaid: true,
    features: ["Everything in Basic", "Purchases & Expenses", "Credits & Customers", "Suppliers & Reports", "Cash Count & Currency"],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "₨4,999/mo",
    tag: "BEST VALUE",
    tagColor: "#4C1D95",
    tagBg: "#EDE9FE",
    emoji: "🟣",
    color: "#4C1D95",
    border: "#7C3AED",
    bg: "rgba(124,58,237,0.08)",
    isPaid: true,
    features: ["Everything in Professional", "User Management", "Audit Logs", "Reconciliation", "Full Admin Access"],
  },
];

const BUSINESS_TYPES = ["Retail", "Wholesale", "Services", "Manufacturing", "Import/Export", "Other"];

// ── Industries from image ────────────────────────────────────────────────────
const INDUSTRIES = [
  "Products", "All Services", "Fashion & Clothing", "Department Stores",
  "Medical", "Footwear", "Liquor", "Sanitary", "Hardware",
  "Salon & Spa", "Electronics & Home Appliances", "Mobile & Digital Stores",
  "Web & Hosting Agencies", "All Daily Needs", "Stationary", "Repair Shops", "Restaurants",
];

const KEY_FEATURES = [
  { icon: "🛒", label: "POS" },
  { icon: "📦", label: "Stock Management" },
  { icon: "🧾", label: "Invoicing" },
  { icon: "🏪", label: "Retail" },
  { icon: "🏭", label: "Whole Sale" },
  { icon: "💼", label: "Consulting" },
];

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Business Info
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [purpose, setPurpose] = useState("");

  // Step 2: Package
  const [selectedPackage, setSelectedPackage] = useState<PackageKey>("professional");

  // Step 3: Admin Account
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const validateStep1 = () => {
    if (!businessName.trim()) { Alert.alert("Required", "Please enter your business name."); return false; }
    if (!businessType) { Alert.alert("Required", "Please select your business type."); return false; }
    if (!ownerName.trim()) { Alert.alert("Required", "Please enter the owner name."); return false; }
    return true;
  };

  const validateStep3 = () => {
    if (!adminUsername.trim() || adminUsername.length < 3) { Alert.alert("Required", "Username must be at least 3 characters."); return false; }
    if (!/^[a-z0-9_]+$/.test(adminUsername)) { Alert.alert("Invalid", "Username can only contain lowercase letters, numbers, and underscores."); return false; }
    if (!adminPassword || adminPassword.length < 6) { Alert.alert("Required", "Password must be at least 6 characters."); return false; }
    if (adminPassword !== confirmPassword) { Alert.alert("Mismatch", "Passwords do not match."); return false; }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateStep3()) return;
    setLoading(true);
    try {
      await customFetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: businessName.trim(),
          businessType,
          ownerName: ownerName.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
          purpose: purpose.trim() || undefined,
          package: selectedPackage,
          adminUsername: adminUsername.toLowerCase().trim(),
          adminPassword,
        }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const pkg = PACKAGES.find(p => p.key === selectedPackage)!;
      Alert.alert(
        "Registration Submitted! 🎉",
        `"${businessName}" registered with the ${pkg.name} plan${pkg.isPaid ? ` (${pkg.price})` : " (Free)"}.\n\nAn admin will approve your account shortly.`,
        [{ text: "Back to Login", onPress: () => router.back() }],
      );
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const selectedPkg = PACKAGES.find(p => p.key === selectedPackage)!;

  return (
    <LinearGradient colors={["#1E3A8A", "#1E40AF", "#312E81"]} style={[styles.container, { paddingTop: topInset }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => step > 1 ? setStep(step - 1) : router.back()} style={styles.backBtn}>
          <Text style={{ fontSize: 18, color: "#FFF" }}>‹</Text>
          <Text style={styles.backText}>{step > 1 ? "Back" : "Login"}</Text>
        </TouchableOpacity>
        <View style={styles.stepIndicator}>
          {[1, 2, 3].map(s => (
            <View key={s} style={[styles.stepDot, { backgroundColor: s <= step ? "#FFF" : "rgba(255,255,255,0.3)" }]} />
          ))}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
        {/* Step header */}
        <View style={styles.stepHeader}>
          <Text style={styles.stepLabel}>STEP {step} OF 3</Text>
          <Text style={styles.stepTitle}>
            {step === 1 ? "Business Details" : step === 2 ? "Choose Your Plan" : "Admin Account"}
          </Text>
          <Text style={styles.stepSub}>
            {step === 1 ? "Tell us about your business" : step === 2 ? "Start free or go paid for more features" : "Create your admin login credentials"}
          </Text>
        </View>

        {/* ── STEP 1: Business Info ─────────────────────────────────────── */}
        {step === 1 && (
          <>
            {/* "One Software for Every Business" banner */}
            <View style={styles.heroBanner}>
              <LinearGradient colors={["#0EA5E9", "#38BDF8"]} style={styles.heroBannerInner}>
                <Text style={styles.heroTitle}>ONE SOFTWARE</Text>
                <Text style={styles.heroTitle}>
                  FOR <Text style={{ color: "#EF4444", fontFamily: "Inter_700Bold" }}>EVERY</Text> BUSINESS
                </Text>
                {/* Key features row */}
                <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10, marginTop: 14 }}>
                  {KEY_FEATURES.map(f => (
                    <View key={f.label} style={styles.featurePill}>
                      <Text style={{ fontSize: 13 }}>✅</Text>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: "#1E3A8A" }}>{f.label}</Text>
                    </View>
                  ))}
                </View>
                {/* Industry grid */}
                <View style={{ marginTop: 14, backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 12, padding: 12 }}>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {INDUSTRIES.map(ind => (
                      <View key={ind} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#22C55E" }} />
                        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: "#FFF" }}>{ind}</Text>
                      </View>
                    ))}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: "#FCD34D" }}>& Many More...</Text>
                    </View>
                  </View>
                </View>
                <Text style={{ fontFamily: "Inter_400Regular", fontStyle: "italic", fontSize: 11, color: "rgba(255,255,255,0.9)", textAlign: "center", marginTop: 10 }}>
                  premium modules available for best features
                </Text>
              </LinearGradient>
            </View>

            <View style={styles.card}>
              <Field label="Business Name *" value={businessName} onChangeText={setBusinessName} placeholder="e.g. Coins Dynasty Ltd" />
              <Field label="Owner Name *" value={ownerName} onChangeText={setOwnerName} placeholder="Full name of the owner" />

              <Text style={styles.fieldLabel}>Business Type *</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {BUSINESS_TYPES.map(t => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setBusinessType(t)}
                    style={[styles.typePill, businessType === t && styles.typePillSelected]}
                  >
                    <Text style={[styles.typePillText, businessType === t && { color: "#FFF" }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="+92 300 0000000" keyboardType="phone-pad" />
              <Field label="Email" value={email} onChangeText={setEmail} placeholder="business@email.com" keyboardType="email-address" />
              <Field label="Address" value={address} onChangeText={setAddress} placeholder="City, Province" />
              <Field label="Business Purpose / Description" value={purpose} onChangeText={setPurpose} placeholder="What does your business do?" multiline />

              <TouchableOpacity
                style={styles.nextBtn}
                onPress={() => { if (validateStep1()) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); setStep(2); } }}
              >
                <Text style={styles.nextBtnText}>Next — Choose Your Plan</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── STEP 2: Package Selection ─────────────────────────────────── */}
        {step === 2 && (
          <View>
            {/* Free vs Paid section labels */}
            <View style={styles.sectionLabelRow}>
              <View style={[styles.sectionLabelBadge, { backgroundColor: "#D1FAE5", borderColor: "#6EE7B7" }]}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#065F46" }}>🆓 FREE PLAN</Text>
              </View>
            </View>

            {/* Free package */}
            {PACKAGES.filter(p => !p.isPaid).map(pkg => (
              <TouchableOpacity
                key={pkg.key}
                onPress={() => { setSelectedPackage(pkg.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }}
                activeOpacity={0.85}
                style={[styles.packageCard, {
                  borderColor: selectedPackage === pkg.key ? "#059669" : "rgba(255,255,255,0.2)",
                  backgroundColor: selectedPackage === pkg.key ? "rgba(5,150,105,0.15)" : "rgba(255,255,255,0.06)",
                }]}
              >
                <View style={styles.packageHeader}>
                  <Text style={{ fontSize: 26 }}>{pkg.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={styles.packageName}>{pkg.name}</Text>
                      <View style={{ backgroundColor: pkg.tagBg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: pkg.tagColor }}>{pkg.tag}</Text>
                      </View>
                    </View>
                    <Text style={[styles.packagePrice, { color: "#6EE7B7" }]}>{pkg.price}</Text>
                    {pkg.limits && <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>{pkg.limits}</Text>}
                  </View>
                  <View style={[styles.radioCircle, selectedPackage === pkg.key && { backgroundColor: "#059669", borderColor: "#059669" }]}>
                    {selectedPackage === pkg.key && <View style={styles.radioDot} />}
                  </View>
                </View>
                <View style={{ gap: 4, marginTop: 8 }}>
                  {pkg.features.map(f => (
                    <View key={f} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ fontSize: 11, color: "#6EE7B7" }}>✓</Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.8)" }}>{f}</Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            ))}

            {/* Paid section label */}
            <View style={[styles.sectionLabelRow, { marginTop: 6 }]}>
              <View style={[styles.sectionLabelBadge, { backgroundColor: "#FEF3C7", borderColor: "#FCD34D" }]}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#92400E" }}>💳 PAID PLANS</Text>
              </View>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(255,255,255,0.5)" }}>Unlock full features</Text>
            </View>

            {/* Paid packages */}
            {PACKAGES.filter(p => p.isPaid).map(pkg => (
              <TouchableOpacity
                key={pkg.key}
                onPress={() => { setSelectedPackage(pkg.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }}
                activeOpacity={0.85}
                style={[styles.packageCard, {
                  borderColor: selectedPackage === pkg.key ? pkg.border : "rgba(255,255,255,0.15)",
                  backgroundColor: selectedPackage === pkg.key ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
                }]}
              >
                <View style={styles.packageHeader}>
                  <Text style={{ fontSize: 26 }}>{pkg.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={styles.packageName}>{pkg.name}</Text>
                      <View style={{ backgroundColor: pkg.tagBg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: pkg.tagColor }}>{pkg.tag}</Text>
                      </View>
                    </View>
                    <Text style={styles.packagePrice}>{pkg.price}</Text>
                  </View>
                  <View style={[styles.radioCircle, selectedPackage === pkg.key && { backgroundColor: pkg.border, borderColor: pkg.border }]}>
                    {selectedPackage === pkg.key && <View style={styles.radioDot} />}
                  </View>
                </View>
                <View style={{ gap: 4, marginTop: 8 }}>
                  {pkg.features.map(f => (
                    <View key={f} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ fontSize: 11, color: "#A7F3D0" }}>✓</Text>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.8)" }}>{f}</Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.nextBtn}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); setStep(3); }}
            >
              <Text style={styles.nextBtnText}>
                Next — {selectedPkg.isPaid ? `Create Admin (${selectedPkg.price})` : "Create Admin (Free)"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP 3: Admin Account ─────────────────────────────────────── */}
        {step === 3 && (
          <View style={styles.card}>
            {/* Summary */}
            <View style={{
              borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1,
              backgroundColor: selectedPkg.isPaid ? "#EFF6FF" : "#ECFDF5",
              borderColor: selectedPkg.isPaid ? "#BFDBFE" : "#6EE7B7",
            }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: selectedPkg.isPaid ? "#1E3A8A" : "#065F46" }}>
                  Registration Summary
                </Text>
                <View style={{
                  paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
                  backgroundColor: selectedPkg.isPaid ? "#FEF3C7" : "#D1FAE5",
                }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: selectedPkg.isPaid ? "#92400E" : "#065F46" }}>
                    {selectedPkg.isPaid ? "💳 PAID" : "🆓 FREE"}
                  </Text>
                </View>
              </View>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#1E40AF" }}>🏢 {businessName}</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#1E40AF" }}>
                {selectedPkg.emoji} {selectedPkg.name} Plan — {selectedPkg.price}
              </Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#1E40AF" }}>👤 Owner: {ownerName}</Text>
            </View>

            <Field
              label="Admin Username *"
              value={adminUsername}
              onChangeText={t => setAdminUsername(t.toLowerCase())}
              placeholder="e.g. coinsdynasty_admin"
              autoCapitalize="none"
            />
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "#94A3B8", marginTop: -12, marginBottom: 14 }}>
              Lowercase letters, numbers, underscores only
            </Text>

            <Field
              label="Password *"
              value={adminPassword}
              onChangeText={setAdminPassword}
              placeholder="At least 6 characters"
              secureTextEntry={!showPassword}
            />
            <Field
              label="Confirm Password *"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Repeat your password"
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ marginBottom: 20 }}>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#94A3B8" }}>
                {showPassword ? "🙈 Hide password" : "👁 Show password"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.nextBtn, { backgroundColor: loading ? "#64748B" : selectedPkg.isPaid ? "#2563EB" : "#059669" }]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#FFF" />
                : <Text style={styles.nextBtnText}>
                    {selectedPkg.isPaid ? `Submit (${selectedPkg.price})` : "Submit Free Registration"}
                  </Text>}
            </TouchableOpacity>

            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.5)", textAlign: "center", marginTop: 12 }}>
              {selectedPkg.isPaid
                ? "After approval, payment collection will be confirmed with you."
                : "Free plan approved instantly after admin review."}
            </Text>
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, multiline, secureTextEntry, autoCapitalize }: {
  label: string; value: string; onChangeText: (t: string) => void;
  placeholder?: string; keyboardType?: "default" | "phone-pad" | "email-address";
  multiline?: boolean; secureTextEntry?: boolean; autoCapitalize?: "none" | "sentences";
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        keyboardType={keyboardType ?? "default"}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize ?? (multiline ? "sentences" : "words")}
        autoCorrect={false}
        style={[styles.input, multiline && { height: 80, textAlignVertical: "top" }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 8, paddingTop: 8 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  backText: { fontFamily: "Inter_500Medium", fontSize: 14, color: "#FFF" },
  stepIndicator: { flexDirection: "row", gap: 6 },
  stepDot: { width: 8, height: 8, borderRadius: 4 },
  stepHeader: { marginVertical: 20, alignItems: "center" },
  stepLabel: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: "rgba(255,255,255,0.6)", letterSpacing: 1.5, marginBottom: 6 },
  stepTitle: { fontFamily: "Inter_700Bold", fontSize: 24, color: "#FFF", textAlign: "center", marginBottom: 6 },
  stepSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.65)", textAlign: "center" },
  card: { backgroundColor: "#FFF", borderRadius: 20, padding: 24, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 20, elevation: 6 },
  fieldLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#475569", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  input: { backgroundColor: "#F8FAFC", borderRadius: 12, borderWidth: 1.5, borderColor: "#E2E8F0", paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: "#1E293B" },
  typePill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: "#CBD5E1", backgroundColor: "#F8FAFC" },
  typePillSelected: { backgroundColor: "#2563EB", borderColor: "#2563EB" },
  typePillText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#475569" },
  heroBanner: { marginBottom: 16, borderRadius: 18, overflow: "hidden" },
  heroBannerInner: { padding: 18 },
  heroTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: "#FFF", textAlign: "center", lineHeight: 26 },
  featurePill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#FFF", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  sectionLabelRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  sectionLabelBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  packageCard: { borderWidth: 2, borderRadius: 18, padding: 18, marginBottom: 12 },
  packageHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  packageName: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFF" },
  packagePrice: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  radioCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "rgba(255,255,255,0.4)", alignItems: "center", justifyContent: "center", marginLeft: "auto" },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#FFF" },
  nextBtn: { backgroundColor: "#2563EB", borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 8 },
  nextBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFF" },
});
