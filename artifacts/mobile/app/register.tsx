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
type PackageKey = "basic" | "professional" | "enterprise";

const PACKAGES: { key: PackageKey; name: string; price: string; emoji: string; color: string; border: string; features: string[] }[] = [
  {
    key: "basic",
    name: "Basic",
    price: "₨999/mo",
    emoji: "🟢",
    color: "#065F46",
    border: "#059669",
    features: ["POS & Sales", "Inventory Management", "Accounts & Apps", "Product Categories"],
  },
  {
    key: "professional",
    name: "Professional",
    price: "₨2,499/mo",
    emoji: "🔵",
    color: "#1E3A8A",
    border: "#2563EB",
    features: ["Everything in Basic", "Purchases & Expenses", "Credits & Customers", "Suppliers & Reports", "Cash Count & Currency"],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "₨4,999/mo",
    emoji: "🟣",
    color: "#4C1D95",
    border: "#7C3AED",
    features: ["Everything in Professional", "User Management", "Audit Logs", "Reconciliation", "Full Admin Access"],
  },
];

const BUSINESS_TYPES = ["Retail", "Wholesale", "Services", "Manufacturing", "Import/Export", "Other"];

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
      Alert.alert(
        "Registration Submitted!",
        `Your business "${businessName}" has been registered with the ${PACKAGES.find(p => p.key === selectedPackage)!.name} package.\n\nAn admin will review and approve your account. You will be able to log in once approved.`,
        [{ text: "Back to Login", onPress: () => router.back() }],
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Registration failed";
      Alert.alert("Error", msg);
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
            {step === 1 ? "Business Details" : step === 2 ? "Choose a Package" : "Admin Account"}
          </Text>
          <Text style={styles.stepSub}>
            {step === 1 ? "Tell us about your business" : step === 2 ? "Select the right plan for you" : "Create your admin login credentials"}
          </Text>
        </View>

        {/* ── STEP 1: Business Info ─────────────────────────────────────── */}
        {step === 1 && (
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
              <Text style={styles.nextBtnText}>Next — Choose Package</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP 2: Package Selection ─────────────────────────────────── */}
        {step === 2 && (
          <View>
            {PACKAGES.map(pkg => (
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
                  <Text style={{ fontSize: 28 }}>{pkg.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={styles.packageName}>{pkg.name}</Text>
                      {pkg.key === "professional" && (
                        <View style={{ backgroundColor: "#FCD34D", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: "#78350F" }}>POPULAR</Text>
                        </View>
                      )}
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
              <Text style={styles.nextBtnText}>Next — Create Admin Account</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP 3: Admin Account ─────────────────────────────────────── */}
        {step === 3 && (
          <View style={styles.card}>
            {/* Summary */}
            <View style={{ backgroundColor: "#EFF6FF", borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: "#BFDBFE" }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#1E3A8A", marginBottom: 4 }}>Summary</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#1E40AF" }}>🏢 {businessName}</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#1E40AF" }}>{selectedPkg.emoji} {selectedPkg.name} Plan — {selectedPkg.price}</Text>
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

            <View style={{ position: "relative" }}>
              <Field
                label="Password *"
                value={adminPassword}
                onChangeText={setAdminPassword}
                placeholder="At least 6 characters"
                secureTextEntry={!showPassword}
              />
            </View>
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
              style={[styles.nextBtn, { backgroundColor: loading ? "#64748B" : "#059669" }]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#FFF" />
                : <Text style={styles.nextBtnText}>Submit Registration</Text>}
            </TouchableOpacity>

            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.5)", textAlign: "center", marginTop: 12 }}>
              After submission, an admin will review and approve your account.
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
  stepHeader: { marginVertical: 24, alignItems: "center" },
  stepLabel: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: "rgba(255,255,255,0.6)", letterSpacing: 1.5, marginBottom: 6 },
  stepTitle: { fontFamily: "Inter_700Bold", fontSize: 26, color: "#FFF", textAlign: "center", marginBottom: 6 },
  stepSub: { fontFamily: "Inter_400Regular", fontSize: 14, color: "rgba(255,255,255,0.65)", textAlign: "center" },
  card: { backgroundColor: "#FFF", borderRadius: 20, padding: 24, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 20, elevation: 6 },
  fieldLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#475569", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  input: { backgroundColor: "#F8FAFC", borderRadius: 12, borderWidth: 1.5, borderColor: "#E2E8F0", paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: "#1E293B" },
  typePill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: "#CBD5E1", backgroundColor: "#F8FAFC" },
  typePillSelected: { backgroundColor: "#2563EB", borderColor: "#2563EB" },
  typePillText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#475569" },
  packageCard: { borderWidth: 2, borderRadius: 18, padding: 18, marginBottom: 14 },
  packageHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  packageName: { fontFamily: "Inter_700Bold", fontSize: 17, color: "#FFF" },
  packagePrice: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  radioCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "rgba(255,255,255,0.4)", alignItems: "center", justifyContent: "center", marginLeft: "auto" },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#FFF" },
  nextBtn: { backgroundColor: "#2563EB", borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 8 },
  nextBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFF" },
});
