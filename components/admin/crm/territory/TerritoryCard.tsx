import React from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { ChevronDown, ChevronRight, ChevronUp, Edit3, Trash2 } from "lucide-react-native";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";
import { territoryCompletion, type CrmTerritoryNode } from "@/types/crm/territory";

type TerritoryCardProps = {
  node: CrmTerritoryNode;
  childLabel: string;
  navigable: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onPress?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

export function TerritoryCard({
  node, childLabel, navigable, canMoveUp, canMoveDown,
  onPress, onEdit, onDelete, onToggleActive, onMoveUp, onMoveDown,
}: TerritoryCardProps) {
  const completion = territoryCompletion(node);
  return (
    <CRMCard className="p-4">
      <Pressable disabled={!navigable} onPress={onPress} className="min-h-11">
        <View className="flex-row items-start justify-between">
          <View className="flex-1 min-w-0 pr-2">
            <View className="flex-row items-center flex-wrap gap-2">
              <Text className="text-foreground text-base font-bold" numberOfLines={1}>{node.name}</Text>
              {!node.is_active ? (
                <View className="px-2 py-0.5 rounded-full bg-muted">
                  <Text className="text-muted-foreground text-caption font-bold">INACTIVE</Text>
                </View>
              ) : null}
            </View>
            <Text className="text-muted-foreground text-xs mt-1">
              {node.child_count} {childLabel} · {node.vendor_count} vendors
            </Text>
          </View>
          {navigable ? <ChevronRight size={18} className="text-muted-foreground mt-1" /> : null}
        </View>

        <View className="mt-3">
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-muted-foreground text-metadata font-semibold">COMPLETION</Text>
            <Text className="text-primary text-metadata font-bold">{completion}%</Text>
          </View>
          <View className="h-1.5 rounded-full bg-muted overflow-hidden">
            <View className="h-1.5 rounded-full bg-primary" style={{ width: `${completion}%` }} />
          </View>
        </View>
      </Pressable>

      <View className="flex-row items-center justify-end gap-1 mt-3 pt-3 border-t border-border">
        <Pressable accessibilityLabel="Move up" disabled={!canMoveUp} onPress={onMoveUp} className="w-9 h-9 rounded-xl items-center justify-center" style={{ opacity: canMoveUp ? 1 : 0.3 }}>
          <ChevronUp size={16} className="text-muted-foreground" />
        </Pressable>
        <Pressable accessibilityLabel="Move down" disabled={!canMoveDown} onPress={onMoveDown} className="w-9 h-9 rounded-xl items-center justify-center" style={{ opacity: canMoveDown ? 1 : 0.3 }}>
          <ChevronDown size={16} className="text-muted-foreground" />
        </Pressable>
        <Pressable accessibilityLabel={`Rename ${node.name}`} onPress={onEdit} className="w-9 h-9 rounded-xl items-center justify-center">
          <Edit3 size={15} className="text-primary" />
        </Pressable>
        <Switch
          value={node.is_active}
          onValueChange={onToggleActive}
          trackColor={{ false: "#E7E1E4", true: "#F4A9C4" }}
          thumbColor={node.is_active ? "#E91E63" : "#FFFFFF"}
        />
        <Pressable accessibilityLabel={`Delete ${node.name}`} onPress={onDelete} className="w-9 h-9 rounded-xl items-center justify-center">
          <Trash2 size={15} color="#DC3545" />
        </Pressable>
      </View>
    </CRMCard>
  );
}
