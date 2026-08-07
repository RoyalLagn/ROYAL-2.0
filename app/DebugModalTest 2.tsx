import React, { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { CalendarDays, X } from "lucide-react-native";

/**
 * TEMPORARY verification harness for the VendorEnquiries modal
 * KeyboardAvoidingView fix. Not part of the app — delete after testing.
 */
export default function DebugModalTest() {
  const [selected, setSelected] = useState(true);
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState("");

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <Modal visible={selected} transparent animationType="slide" onRequestClose={() => setSelected(false)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.sheet, { backgroundColor: "#fff" }]}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.sheetTop}>
                <View style={styles.flex}>
                  <Text style={styles.sheetTitle}>Test Customer</Text>
                  <Text style={styles.meta}>REF-001 · Photography Package</Text>
                </View>
                <Pressable onPress={() => setSelected(false)} style={styles.close}>
                  <X size={20} color="#141414" />
                </Pressable>
              </View>
              <Text style={styles.message}>Sample enquiry message for layout testing.</Text>

              <Text style={styles.fieldLabel}>Private vendor notes</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholder="Add context for your follow-up"
                placeholderTextColor="#999"
                style={styles.notes}
              />

              <Text style={styles.fieldLabel}>Follow-up date</Text>
              <View style={styles.dateInput}>
                <CalendarDays size={16} color="#E91E63" />
                <TextInput
                  value={followUp}
                  onChangeText={setFollowUp}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#999"
                  style={[styles.flex, { fontSize: 11 }]}
                />
              </View>

              <Pressable onPress={() => {}} style={styles.save}>
                <Text style={styles.saveText}>Save lead update</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15,8,12,.55)", justifyContent: "flex-end" },
  sheet: { width: "100%", maxWidth: 620, maxHeight: "92%", alignSelf: "center", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 30 },
  sheetTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  sheetTitle: { fontSize: 18, fontWeight: "900" },
  meta: { fontSize: 9, marginTop: 3, color: "#777" },
  close: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#F3E6EF" },
  flex: { flex: 1, minWidth: 0 },
  message: { fontSize: 11, lineHeight: 17, marginTop: 12 },
  fieldLabel: { fontSize: 10, fontWeight: "800", marginTop: 18, marginBottom: 8 },
  notes: { minHeight: 92, borderWidth: 1, borderColor: "#eee", borderRadius: 14, padding: 12, fontSize: 11, textAlignVertical: "top" },
  dateInput: { height: 46, borderWidth: 1, borderColor: "#eee", borderRadius: 14, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  save: { minHeight: 49, borderRadius: 15, backgroundColor: "#E91E63", alignItems: "center", justifyContent: "center", marginTop: 20 },
  saveText: { color: "#FFF", fontSize: 11, fontWeight: "900" },
});
