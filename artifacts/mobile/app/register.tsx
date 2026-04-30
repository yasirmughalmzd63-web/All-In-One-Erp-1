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

/* ─── Package definitions ─────────────────────────────────────────────────── */
type PackageKey = "free" | "basic" | "professional" | "enterprise";

const PACKAGES: {
  key: PackageKey; name: string; price: string; tag: string;
  tagColor: string; tagBg: string; emoji: string;
  border: string; isPaid: boolean; features: string[]; limits?: string;
}[] = [
  {
    key: "free", name: "Free Starter", price: "Free", tag: "FREE",
    tagColor: "#065F46", tagBg: "#D1FAE5", emoji: "🆓",
    border: "#9CA3AF", isPaid: false,
    features: ["POS & Basic Sales", "1 Location", "Up to 3 Products"],
    limits: "Limited — upgrade anytime",
  },
  {
    key: "basic", name: "Basic", price: "₨999/mo", tag: "PAID",
    tagColor: "#92400E", tagBg: "#FEF3C7", emoji: "🟢",
    border: "#059669", isPaid: true,
    features: ["POS & Sales", "Inventory", "Accounts & Apps", "Credits"],
  },
  {
    key: "professional", name: "Professional", price: "₨2,499/mo", tag: "POPULAR",
    tagColor: "#1E3A8A", tagBg: "#DBEAFE", emoji: "🔵",
    border: "#2563EB", isPaid: true,
    features: ["Everything in Basic", "Purchases & Expenses", "Suppliers & Reports", "Cash Count"],
  },
  {
    key: "enterprise", name: "Enterprise", price: "₨4,999/mo", tag: "BEST VALUE",
    tagColor: "#4C1D95", tagBg: "#EDE9FE", emoji: "🟣",
    border: "#7C3AED", isPaid: true,
    features: ["Everything in Professional", "User Management", "Audit Logs", "Full Admin Access"],
  },
];

const BUSINESS_NATURES = [
  { emoji: "🛒", label: "Products / POS" },
  { emoji: "👗", label: "Fashion & Clothing" },
  { emoji: "📱", label: "Electronics" },
  { emoji: "🏥", label: "Medical" },
  { emoji: "🔧", label: "Hardware" },
  { emoji: "💇", label: "Salon & Spa" },
  { emoji: "🍽️", label: "Restaurant" },
  { emoji: "📦", label: "Wholesale" },
  { emoji: "🌐", label: "Web & Agency" },
  { emoji: "🔌", label: "Repair Shop" },
  { emoji: "🏗️", label: "Sanitary" },
  { emoji: "🔑", label: "Other" },
];

const BUSINESS_TYPES = ["Retail", "Wholesale", "Services", "Manufacturing", "Import/Export", "Other"];

/* ─── Reusable field ──────────────────────────────────────────────────────── */
function Field({
  label, value, onChangeText, placeholder, keyboardType, multiline, autoCapitalize, hint,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: "default" | "phone-pad" | "email-address" | "decimal-pad";
  multiline?: boolean; autoCapitalize?: "none" | "sentences" | "words";
  hint?: string;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={[s.input, multiline && { height: 72, textAlignVertical: "top" }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        keyboardType={keyboardType ?? "default"}
        multiline={multiline}
        autoCapitalize={autoCapitalize ?? "sentences"}
        autoCorrect={false}
      />
      {hint && <Text style={s.hint}>{hint}</Text>}
    </View>
  );
}

/* ─── Main component ──────────────────────────────────────────────────────── */
export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const [step, setStep]       = useState(1);
  const [loading, setLoading] = useState(false);
  const [showOptional, setShowOptional] = useState(false);

  /* Step 1 fields */
  const [businessName,   setBusinessName]   = useState("");
  const [businessNature, setBusinessNature] = useState("");
  const [businessType,   setBusinessType]   = useState("");
  const [ownerName,      setOwnerName]      = useState("");
  const [ownerPhone,     setOwnerPhone]     = useState("");

  /* Optional extras */
  const [ownerCnic, setOwnerCnic] = useState("");
  const [email,     setEmail]     = useState("");
  const [address,   setAddress]   = useState("");
  const [purpose,   setPurpose]   = useState("");

  /* Step 2 */
  const [selectedPackage, setSelectedPackage] = useState<PackageKey>("professional");

  /* Step 3 */
  const [adminUsername,   setAdminUsername]   = useState("");
  const [adminPassword,   setAdminPassword]   = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword,    setShowPassword]    = useState(false);

  const selectedPkg = PACKAGES.find(p => p.key === selectedPackage)!;

  const validateStep1 = () => {
    if (!businessName.trim())  { Alert.alert("Required", "Enter your business name."); return false; }
    if (!businessNature)       { Alert.alert("Required", "Select your business nature."); return false; }
    if (!businessType)         { Alert.alert("Required", "Select your business type."); return false; }
    if (!ownerName.trim())     { Alert.alert("Required", "Enter the owner name."); return false; }
    return true;
  };

  const validateStep3 = () => {
    if (!adminUsername.trim() || adminUsername.length < 3) {
      Alert.alert("Required", "Username must be at least 3 characters."); return false;
    }
    if (!/^[a-z0-9_]+$/.test(adminUsername)) {
      Alert.alert("Invalid", "Username: lowercase letters, numbers and underscores only."); return false;
    }
    if (!adminPassword || adminPassword.length < 6) {
      Alert.alert("Required", "Password must be at least 6 characters."); return false;
    }
    if (adminPassword !== confirmPassword) {
      Alert.alert("Mismatch", "Passwords do not match."); return false;
    }
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
          businessName:    businessName.trim(),
          businessNature,
          businessType,
          ownerName:       ownerName.trim(),
          ownerPhone:      ownerPhone.trim()  || undefined,
          ownerCnic:       ownerCnic.trim()   || undefined,
          email:           email.trim()       || undefined,
          address:         address.trim()     || undefined,
          purpose:         purpose.trim()     || undefined,
          package:         selectedPackage,
          adminUsername:   adminUsername.toLowerCase().trim(),
          adminPassword,
        }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(
        "Registration Submitted 🎉",
        `"${businessName}" is registered on the ${selectedPkg.name} plan. An admin will approve your account shortly.`,
        [{ text: "Back to Login", onPress: () => router.back() }],
      );
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  const next = (nextStep: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setStep(nextStep);
  };

  return (
    <LinearGradient colors={["#1E3A8A", "#1E40AF", "#312E81"]} style={[s.root, { paddingTop: topInset }]}>
      {/* ── Top nav ── */}
      <View style={s.nav}>
        <TouchableOpacity onPress={() => step > 1 ? setStep(step - 1) : router.back()} style={s.back}>
          <Text style={s.backCaret}>‹</Text>
          <Text style={s.backText}>{step > 1 ? "Back" : "Login"}</Text>
        </TouchableOpacity>

        {/* Progress dots */}
        <View style={s.dots}>
          {[1, 2, 3].map(n => (
            <View key={n} style={[s.dot, { backgroundColor: n <= step ? "#FFF" : "rgba(255,255,255,0.25)" }]} />
          ))}
        </View>

        {/* Step counter */}
        <View style={{ width: 56, alignItems: "flex-end" }}>
          <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "Inter_500Medium" }}>
            {step} / 3
          </Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* Step title block */}
        <View style={s.titleBlock}>
          <Text style={s.stepLabel}>STEP {step} OF 3</Text>
          <Text style={s.stepTitle}>
            {step === 1 ? "Business Details" : step === 2 ? "Choose Your Plan" : "Admin Account"}
          </Text>
          <Text style={s.stepSub}>
            {step === 1
              ? "Tell us a bit about your business"
              : step === 2
              ? "Start free or unlock more features"
              : "Set up your admin login"}
          </Text>
        </View>

        {/* ══ STEP 1 ══════════════════════════════════════════════════════ */}
        {step === 1 && (
          <View style={s.card}>
            <Field
              label="Business Name *"
              value={businessName}
              onChangeText={setBusinessName}
              placeholder="e.g. Coins Dynasty Ltd"
              autoCapitalize="words"
            />

            {/* Business Nature */}
            <Text style={s.label}>Business Nature *</Text>
            <View style={s.grid}>
              {BUSINESS_NATURES.map(n => {
                const active = businessNature === n.label;
                return (
                  <TouchableOpacity
                    key={n.label}
                    onPress={() => setBusinessNature(n.label)}
                    style={[s.chip, active && s.chipActive]}
                  >
                    <Text style={{ fontSize: 14 }}>{n.emoji}</Text>
                    <Text style={[s.chipText, active && s.chipTextActive]}>{n.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Business Type */}
            <Text style={[s.label, { marginTop: 4 }]}>Business Type *</Text>
            <View style={[s.grid, { gap: 6 }]}>
              {BUSINESS_TYPES.map(t => {
                const active = businessType === t;
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setBusinessType(t)}
                    style={[s.chip, { paddingHorizontal: 12 }, active && s.chipActive]}
                  >
                    <Text style={[s.chipText, active && s.chipTextActive]}>{t}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Owner */}
            <View style={s.divider} />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label="Owner Name *" value={ownerName} onChangeText={setOwnerName} placeholder="Full name" autoCapitalize="words" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Phone (optional)" value={ownerPhone} onChangeText={setOwnerPhone} placeholder="+92 300 …" keyboardType="phone-pad" />
              </View>
            </View>

            {/* Optional extras toggle */}
            <TouchableOpacity
              style={s.optionalToggle}
              onPress={() => setShowOptional(v => !v)}
            >
              <Text style={s.optionalToggleText}>
                {showOptional ? "▲ Hide optional fields" : "▼ Add more details (optional)"}
              </Text>
            </TouchableOpacity>

            {showOptional && (
              <View style={{ marginTop: 8 }}>
                <Field label="Owner CNIC" value={ownerCnic} onChangeText={setOwnerCnic} placeholder="35202-1234567-1" keyboardType="phone-pad" />
                <Field label="Business Email" value={email} onChangeText={setEmail} placeholder="business@email.com" keyboardType="email-address" autoCapitalize="none" />
                <Field label="Address" value={address} onChangeText={setAddress} placeholder="City, Province" />
                <Field label="Business Description" value={purpose} onChangeText={setPurpose} placeholder="What does your business do?" multiline />
              </View>
            )}

            <TouchableOpacity
              style={s.nextBtn}
              onPress={() => { if (validateStep1()) next(2); }}
            >
              <Text style={s.nextBtnText}>Next — Choose Your Plan →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ══ STEP 2 ══════════════════════════════════════════════════════ */}
        {step === 2 && (
          <View>
            {PACKAGES.map((pkg, idx) => {
              const active = selectedPackage === pkg.key;
              return (
                <React.Fragment key={pkg.key}>
                  {idx === 1 && (
                    <View style={s.planSectionLabel}>
                      <Text style={s.planSectionText}>💳 PAID PLANS — Unlock full features</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => { setSelectedPackage(pkg.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }}
                    style={[s.planCard, {
                      borderColor: active ? pkg.border : "rgba(255,255,255,0.15)",
                      backgroundColor: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
                    }]}
                  >
                    <View style={s.planRow}>
                      <Text style={{ fontSize: 24 }}>{pkg.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                          <Text style={s.planName}>{pkg.name}</Text>
                          <View style={{ backgroundColor: pkg.tagBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 }}>
                            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: pkg.tagColor }}>{pkg.tag}</Text>
                          </View>
                        </View>
                        <Text style={[s.planPrice, active && { color: "#A5F3FC" }]}>{pkg.price}</Text>
                        {pkg.limits && <Text style={s.planLimits}>{pkg.limits}</Text>}
                      </View>
                      <View style={[s.radio, active && { backgroundColor: pkg.border, borderColor: pkg.border }]}>
                        {active && <View style={s.radioDot} />}
                      </View>
                    </View>
                    <View style={{ gap: 3, marginTop: 8 }}>
                      {pkg.features.map(f => (
                        <View key={f} style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                          <Text style={{ fontSize: 10, color: "#6EE7B7" }}>✓</Text>
                          <Text style={s.planFeature}>{f}</Text>
                        </View>
                      ))}
                    </View>
                  </TouchableOpacity>
                </React.Fragment>
              );
            })}

            <TouchableOpacity style={s.nextBtn} onPress={() => next(3)}>
              <Text style={s.nextBtnText}>
                Next — Create Admin {selectedPkg.isPaid ? `(${selectedPkg.price})` : "(Free)"} →
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ══ STEP 3 ══════════════════════════════════════════════════════ */}
        {step === 3 && (
          <View style={s.card}>
            {/* Summary pill */}
            <View style={s.summaryBox}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <Text style={s.summaryTitle}>Registration Summary</Text>
                <View style={{ backgroundColor: selectedPkg.isPaid ? "#FEF3C7" : "#D1FAE5", borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: selectedPkg.isPaid ? "#92400E" : "#065F46" }}>
                    {selectedPkg.isPaid ? "💳 PAID" : "🆓 FREE"}
                  </Text>
                </View>
              </View>
              <View style={{ gap: 3 }}>
                <Text style={s.summaryRow}>🏢 {businessName}</Text>
                <Text style={s.summaryRow}>🏷️ {businessNature} · {businessType}</Text>
                <Text style={s.summaryRow}>{selectedPkg.emoji} {selectedPkg.name} — {selectedPkg.price}</Text>
                <Text style={s.summaryRow}>👤 {ownerName}</Text>
              </View>
            </View>

            <Field
              label="Admin Username *"
              value={adminUsername}
              onChangeText={t => setAdminUsername(t.toLowerCase())}
              placeholder="e.g. coinsdynasty_admin"
              autoCapitalize="none"
              hint="Lowercase letters, numbers and underscores only"
            />

            {/* Password row */}
            <Text style={s.label}>Password *</Text>
            <View style={s.passwordWrap}>
              <TextInput
                style={[s.input, { flex: 1, marginBottom: 0, borderWidth: 0 }]}
                value={adminPassword}
                onChangeText={setAdminPassword}
                placeholder="At least 6 characters"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={{ padding: 8 }}>
                <Text style={{ fontSize: 16 }}>{showPassword ? "🙈" : "👁️"}</Text>
              </TouchableOpacity>
            </View>
            <View style={{ marginBottom: 14 }} />

            <Field
              label="Confirm Password *"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Repeat your password"
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={[s.nextBtn, loading && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#FFF" />
                : <Text style={s.nextBtnText}>Submit Registration 🎉</Text>
              }
            </TouchableOpacity>

            <Text style={s.disclaimer}>
              Your registration will be reviewed and approved by an administrator before you can log in.
            </Text>
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

/* ─── Styles ──────────────────────────────────────────────────────────────── */
const s = StyleSheet.create({
  root:         { flex: 1 },
  nav:          { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12 },
  back:         { flexDirection: "row", alignItems: "center", gap: 4, width: 56 },
  backCaret:    { fontSize: 20, color: "#FFF", lineHeight: 22 },
  backText:     { color: "#FFF", fontSize: 14, fontFamily: "Inter_500Medium" },
  dots:         { flexDirection: "row", gap: 6 },
  dot:          { width: 8, height: 8, borderRadius: 4 },
  scroll:       { paddingHorizontal: 20, paddingBottom: 48 },

  titleBlock:   { marginBottom: 20, marginTop: 4 },
  stepLabel:    { color: "rgba(255,255,255,0.55)", fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1, marginBottom: 4 },
  stepTitle:    { color: "#FFF", fontSize: 24, fontFamily: "Inter_700Bold", marginBottom: 4 },
  stepSub:      { color: "rgba(255,255,255,0.65)", fontSize: 14, fontFamily: "Inter_400Regular" },

  card:         { backgroundColor: "#FFF", borderRadius: 20, padding: 20 },
  label:        { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#374151", marginBottom: 6 },
  input:        { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular", color: "#111827", marginBottom: 0 },
  hint:         { fontSize: 11, color: "#9CA3AF", fontFamily: "Inter_400Regular", marginTop: 4 },
  divider:      { height: 1, backgroundColor: "#F3F4F6", marginVertical: 14 },

  grid:         { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  chip:         { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5, borderColor: "#E5E7EB", backgroundColor: "#F9FAFB" },
  chipActive:   { borderColor: "#2563EB", backgroundColor: "#EFF6FF" },
  chipText:     { fontSize: 12, fontFamily: "Inter_500Medium", color: "#374151" },
  chipTextActive: { color: "#1D4ED8", fontFamily: "Inter_700Bold" },

  optionalToggle:     { alignItems: "center", paddingVertical: 10, marginTop: 4 },
  optionalToggleText: { fontSize: 13, color: "#6B7280", fontFamily: "Inter_500Medium" },

  nextBtn:      { backgroundColor: "#2563EB", borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 16 },
  nextBtnText:  { color: "#FFF", fontSize: 15, fontFamily: "Inter_700Bold" },

  /* Plan cards */
  planSectionLabel: { marginTop: 4, marginBottom: 10 },
  planSectionText:  { color: "rgba(255,255,255,0.55)", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  planCard:     { borderRadius: 16, borderWidth: 1.5, padding: 16, marginBottom: 10 },
  planRow:      { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  planName:     { color: "#FFF", fontSize: 15, fontFamily: "Inter_700Bold" },
  planPrice:    { color: "rgba(255,255,255,0.75)", fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 1 },
  planLimits:   { color: "rgba(255,255,255,0.4)", fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
  planFeature:  { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "Inter_400Regular" },
  radio:        { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: "rgba(255,255,255,0.4)", alignItems: "center", justifyContent: "center" },
  radioDot:     { width: 10, height: 10, borderRadius: 5, backgroundColor: "#FFF" },

  /* Step 3 */
  summaryBox:   { backgroundColor: "#EFF6FF", borderRadius: 14, padding: 14, marginBottom: 18, borderWidth: 1, borderColor: "#BFDBFE" },
  summaryTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#1E3A8A" },
  summaryRow:   { fontSize: 12, fontFamily: "Inter_400Regular", color: "#1E40AF" },

  passwordWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 2, marginBottom: 0 },

  disclaimer:   { color: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 16, lineHeight: 16 },
});
