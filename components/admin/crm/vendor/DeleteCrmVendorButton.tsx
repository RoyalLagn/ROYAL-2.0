import React, { useState } from "react";
import { ActivityIndicator, Modal, Text, View } from "react-native";
import { Trash2 } from "lucide-react-native";
import Pressable from "@/components/InteropSafePressable";
import { CrmVendorService } from "@/services/crm/vendorService";

export function DeleteCrmVendorButton({
  vendor,
  onDeleted,
  confirmOnly = false,
  onClose,
}: {
  vendor: { id: string; business_name: string };
  onDeleted: () => void | Promise<void>;
  confirmOnly?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(confirmOnly);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    if (!saving) {
      setOpen(false);
      setError(null);
      onClose?.();
    }
  };
  const remove = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await CrmVendorService.remove(vendor.id);
      setOpen(false);
      await onDeleted();
      onClose?.();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to delete this vendor. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      {!confirmOnly && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete vendor ${vendor.business_name}`}
          onPress={() => {
            setError(null);
            setOpen(true);
          }}
          className="flex-row items-center justify-center self-start rounded-xl border border-red-200 bg-red-50 px-4"
          style={({ pressed, focused }) => ({
            minHeight: 48,
            gap: 8,
            opacity: pressed ? 0.75 : 1,
            borderColor: focused ? "#B42318" : "#FECACA",
          })}
        >
          <Trash2 size={16} color="#B42318" />
          <Text style={{ color: "#B42318", fontSize: 13, fontWeight: "700" }}>
            Delete Vendor
          </Text>
        </Pressable>
      )}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <View className="flex-1 bg-black/50 items-center justify-center p-5">
          <View
            accessibilityViewIsModal
            className="bg-card border border-border rounded-2xl p-5 w-full"
            style={{ maxWidth: 420, gap: 14 }}
          >
            <Text
              accessibilityRole="header"
              className="text-foreground text-lg font-bold"
            >
              Delete this CRM vendor?
            </Text>
            <Text
              className="text-foreground text-sm font-semibold"
              numberOfLines={3}
            >
              {vendor.business_name}
            </Text>
            <Text className="text-muted-foreground text-sm">
              Only this CRM lead and its linked notes, follow-ups, documents,
              activity history and assignments will be removed. Other CRM leads
              and the registered vendor account are not deleted. This cannot be
              undone.
            </Text>
            {error ? (
              <Text
                accessibilityRole="alert"
                style={{ color: "#B42318", fontSize: 13 }}
              >
                {error}
              </Text>
            ) : null}
            <View className="flex-row flex-wrap" style={{ gap: 12 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel vendor deletion"
                disabled={saving}
                onPress={close}
                className="border border-border rounded-xl items-center justify-center px-4"
                style={{ flex: 1, minHeight: 48 }}
              >
                <Text className="text-foreground font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Confirm delete vendor"
                disabled={saving}
                onPress={() => void remove()}
                className="rounded-xl items-center justify-center px-4"
                style={{
                  flex: 1,
                  minHeight: 48,
                  backgroundColor: "#B42318",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? (
                  <ActivityIndicator
                    color="#FFFFFF"
                    accessibilityLabel="Deleting vendor"
                  />
                ) : (
                  <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
                    Delete Vendor
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
