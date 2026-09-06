import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Plus, X } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminEmptyState, AdminErrorState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { CrmSearchBar } from "@/components/admin/crm/ui/SearchBar";
import { CrmSkeletonGrid } from "@/components/admin/crm/ui/SkeletonLoader";
import { TerritoryCard } from "@/components/admin/crm/territory/TerritoryCard";
import { useCrmTerritory } from "@/hooks/crm/useCrmTerritory";
import type { CrmTerritoryNode, TerritoryLevel } from "@/types/crm/territory";

type TerritoryLevelScreenProps = {
  level: TerritoryLevel;
  parentId: string | null;
  title: string;
  subtitle: string;
  itemLabel: string;
  childLabel: string;
  backRoute: string;
  onOpen?: (node: CrmTerritoryNode) => void;
  locationOptions?: string[];
};

const CARDS_PER_PAGE = 30;

export function TerritoryLevelScreen({
  level, parentId, title, subtitle, itemLabel, childLabel, backRoute, onOpen, locationOptions = [],
}: TerritoryLevelScreenProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const columns = width >= 1024 ? 3 : width >= 680 ? 2 : 1;
  const cardWidth = `${(100 / columns).toFixed(4)}%` as `${number}%`;
  const {
    rows, totalCount, query, setQuery, loading, refreshing, saving, error, setError,
    create, rename, remove, move, toggleActive, refresh,
  } = useCrmTerritory(level, parentId);
  const [editing, setEditing] = useState<CrmTerritoryNode | "new" | null>(null);
  const [draftName, setDraftName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<CrmTerritoryNode | null>(null);
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / CARDS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = useMemo(
    () => rows.slice((currentPage - 1) * CARDS_PER_PAGE, currentPage * CARDS_PER_PAGE),
    [currentPage, rows],
  );

  useEffect(() => { setPage(1); }, [level, parentId, query]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  const openEditor = (node: CrmTerritoryNode | "new") => {
    setEditing(node);
    setDraftName(node === "new" ? "" : node.name);
    setError(null);
  };

  const save = async () => {
    if (!draftName.trim()) { setError(`Enter a ${itemLabel.toLowerCase()} name.`); return; }
    const duplicate = rows.find((row) => row.name.trim().toLowerCase() === draftName.trim().toLowerCase() && (editing === "new" || editing === null || row.id !== editing.id));
    if (duplicate) { setError(`${duplicate.name} is already in this territory. Select the existing record instead of creating a duplicate.`); return; }
    if (editing === "new") await create(draftName);
    else if (editing) await rename(editing.id, draftName);
    setEditing(null);
  };

  const requestDelete = (node: CrmTerritoryNode) => {
    if (node.child_count > 0 || node.vendor_count > 0) {
      setError(`${node.name} still has ${node.child_count} ${childLabel.toLowerCase()} and ${node.vendor_count} vendors. Deactivate it instead, or clear it out first.`);
      return;
    }
    setConfirmDelete(node);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ResponsiveContainer className="flex-row items-center py-2">
        <Pressable
          accessibilityLabel="Go back"
          className="min-w-11 min-h-11 items-center justify-center"
          onPress={() => (router.canGoBack() ? router.back() : router.replace(backRoute as never))}
        >
          <ArrowLeft size={21} className="text-foreground" />
        </Pressable>
        <View className="flex-1 px-2 min-w-0">
          <Text className="text-foreground text-xl font-bold" numberOfLines={1}>{title}</Text>
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>{subtitle}</Text>
        </View>
        <Pressable
          accessibilityLabel={`Add ${itemLabel}`}
          className="min-w-11 min-h-11 items-center justify-center rounded-full bg-primary"
          onPress={() => openEditor("new")}
        >
          <Plus size={19} color="#FFFFFF" />
        </Pressable>
      </ResponsiveContainer>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor="#0878E8" />}
      >
        <ResponsiveContainer>
          <ResponsiveSection>
            <CrmSearchBar value={query} placeholder={`Search ${itemLabel.toLowerCase()}s`} onChangeText={setQuery} />
          </ResponsiveSection>

          {error ? (
            <ResponsiveSection>
              <AdminErrorState message={error} onRetry={() => setError(null)} />
            </ResponsiveSection>
          ) : null}

          <ResponsiveSection>
            {loading ? (
              <CrmSkeletonGrid count={4} />
            ) : !rows.length ? (
              <AdminEmptyState
                title={totalCount ? `No ${itemLabel.toLowerCase()}s match your search` : `No ${itemLabel.toLowerCase()}s yet`}
                message={totalCount ? "Try a different search term." : `Add the first ${itemLabel.toLowerCase()} to start organizing this territory.`}
              />
            ) : (
              <>
                <View className="flex-row flex-wrap -m-1.5">
                  {visibleRows.map((node, index) => {
                    const rowIndex = (currentPage - 1) * CARDS_PER_PAGE + index;
                    return (
                      <View key={node.id} className="p-1.5" style={{ width: cardWidth }}>
                        <TerritoryCard
                          node={node}
                          childLabel={childLabel}
                          navigable={Boolean(onOpen)}
                          canMoveUp={rowIndex > 0 && !query.trim()}
                          canMoveDown={rowIndex < rows.length - 1 && !query.trim()}
                          onPress={() => onOpen?.(node)}
                          onEdit={() => openEditor(node)}
                          onDelete={() => requestDelete(node)}
                          onToggleActive={() => void toggleActive(node)}
                          onMoveUp={() => void move(rowIndex, -1)}
                          onMoveDown={() => void move(rowIndex, 1)}
                        />
                      </View>
                    );
                  })}
                </View>
                {rows.length > CARDS_PER_PAGE ? (
                  <View className="flex-row items-center justify-between mt-5">
                    <Text className="text-muted-foreground text-xs">Showing {(currentPage - 1) * CARDS_PER_PAGE + 1}–{Math.min(currentPage * CARDS_PER_PAGE, rows.length)} of {rows.length}</Text>
                    <View className="flex-row items-center gap-2">
                      <Pressable accessibilityRole="button" disabled={currentPage === 1} onPress={() => setPage((value) => value - 1)} className="min-h-11 px-3 rounded-xl border border-border justify-center" style={{ opacity: currentPage === 1 ? 0.45 : 1 }}>
                        <Text className="text-foreground text-metadata font-bold">Previous</Text>
                      </Pressable>
                      <Text className="text-muted-foreground text-metadata">Page {currentPage} / {pageCount}</Text>
                      <Pressable accessibilityRole="button" disabled={currentPage >= pageCount} onPress={() => setPage((value) => value + 1)} className="min-h-11 px-3 rounded-xl bg-primary justify-center" style={{ opacity: currentPage >= pageCount ? 0.45 : 1 }}>
                        <Text className="text-white text-metadata font-bold">Next</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </>
            )}
          </ResponsiveSection>
        </ResponsiveContainer>
      </ScrollView>
      <AdminFooter activeTab="profile" />

      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <Pressable className="flex-1 p-5 items-center justify-center bg-black/50" onPress={() => !saving && setEditing(null)}>
          <Pressable className="w-full max-w-md rounded-3xl p-5 bg-card" onPress={(event) => event.stopPropagation()}>
            <View className="flex-row items-start justify-between mb-4">
              <Text className="text-foreground text-lg font-bold">{editing === "new" ? "Add" : "Rename"} {itemLabel}</Text>
              <Pressable accessibilityLabel="Close" onPress={() => setEditing(null)}><X size={18} className="text-foreground" /></Pressable>
            </View>
            <Text className="text-foreground text-xs font-semibold mb-2">{itemLabel} name</Text>
            <TextInput
              value={draftName}
              onChangeText={setDraftName}
              placeholder={`e.g. ${itemLabel === "Cluster" ? "Lonavala" : itemLabel === "Taluka" ? "Maval" : itemLabel === "District" ? "Pune" : "Maharashtra"}`}
              placeholderTextColor="#9CA3AF"
              className="h-12 border border-border rounded-2xl px-4 text-foreground bg-background"
            />
            {editing === "new" && locationOptions.length ? <View className="mt-3">
              <Text className="text-muted-foreground text-metadata font-semibold mb-1.5">Choose from verified locations</Text>
              <ScrollView style={{ maxHeight: 220 }} className="rounded-2xl border border-border bg-background">
                {locationOptions.filter((name) => !draftName.trim() || name.toLowerCase().includes(draftName.trim().toLowerCase())).map((name) => <Pressable key={name} onPress={() => setDraftName(name)} className="min-h-11 px-4 justify-center border-b border-border"><Text className="text-foreground text-sm">{name}</Text></Pressable>)}
              </ScrollView>
            </View> : null}
            <View className="flex-row gap-3 mt-5">
              <Pressable disabled={saving} onPress={() => setEditing(null)} className="flex-1 h-12 rounded-2xl border border-border items-center justify-center">
                <Text className="text-foreground text-sm font-bold">Cancel</Text>
              </Pressable>
              <Pressable disabled={saving} onPress={() => void save()} className="flex-1 h-12 rounded-2xl bg-primary items-center justify-center">
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-white text-sm font-bold">Save</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={confirmDelete !== null} transparent animationType="fade" onRequestClose={() => setConfirmDelete(null)}>
        <Pressable className="flex-1 p-5 items-center justify-center bg-black/50" onPress={() => !saving && setConfirmDelete(null)}>
          <Pressable className="w-full max-w-md rounded-3xl p-5 bg-card items-center" onPress={(event) => event.stopPropagation()}>
            <Text className="text-foreground text-lg font-bold text-center">Delete {confirmDelete?.name}?</Text>
            <Text className="text-muted-foreground text-xs text-center mt-2">This cannot be undone.</Text>
            <View className="flex-row gap-3 mt-5 w-full">
              <Pressable disabled={saving} onPress={() => setConfirmDelete(null)} className="flex-1 h-12 rounded-2xl border border-border items-center justify-center">
                <Text className="text-foreground text-sm font-bold">Cancel</Text>
              </Pressable>
              <Pressable
                disabled={saving}
                onPress={() => confirmDelete && void remove(confirmDelete).then(() => setConfirmDelete(null))}
                className="flex-1 h-12 rounded-2xl items-center justify-center"
                style={{ backgroundColor: "#DC3545" }}
              >
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-white text-sm font-bold">Delete</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
