import React, { useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Gift,
  Minus,
  PackageCheck,
  Plus,
  Send,
  Sparkles,
  Tag,
} from "lucide-react-native";
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Pressable from "@/components/InteropSafePressable";
import type { VendorPackage, VendorPackageItem } from "@/services/vendorPackages";
import { calculateBookingFinancials, type BookingAddOn } from "@/services/vendorBookings";
import { brandPalette } from "@/constants/brandPalette";
import BookingCalendarModal from "@/components/booking/BookingCalendarModal";

const PINK = brandPalette.light.primary;

export type VendorDirectBookingSectionProps = {
  vendorId: string;
  vendorName: string;
  vendorCategory?: string;
  packages: VendorPackage[];
  loadingPackages?: boolean;
  dark?: boolean;
  onCheckAvailability?: () => void;
  onSendEnquiry: () => void;
  onProceedToBook: (bookingData: {
    selectedPackages: VendorPackage[];
    selectedAddOns: Record<string, BookingAddOn>;
    startDate: string;
    endDate: string;
    totalDays: number;
    financials: {
      totalAmount: number;
      advanceAmount: number;
      dueAmount: number;
    };
  }) => void;
};

const money = (value: number) =>
  `₹${Math.round(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function addDaysToIso(baseIso: string, daysToAdd: number): string {
  const d = new Date(baseIso);
  d.setDate(d.getDate() + daysToAdd);
  return d.toISOString().slice(0, 10);
}

export default function VendorDirectBookingSection({
  vendorId,
  vendorName,
  vendorCategory,
  packages,
  loadingPackages = false,
  dark = false,
  onCheckAvailability,
  onSendEnquiry,
  onProceedToBook,
}: VendorDirectBookingSectionProps) {
  const { width } = useWindowDimensions();
  const desktop = width >= 768;

  // 1. Date selection state (multi-day)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [totalDays, setTotalDays] = useState(1);
  const [dateModalVisible, setDateModalVisible] = useState(false);

  const endDate = useMemo(() => {
    return addDaysToIso(startDate, Math.max(0, totalDays - 1));
  }, [startDate, totalDays]);

  // 2. Package selection state (supports multi-selection, starts unselected)
  const [selectedPackageIds, setSelectedPackageIds] = useState<string[]>([]);
  const [expandedPackageId, setExpandedPackageId] = useState<string | null>(null);

  // 3. Optional add-ons selected per package
  const [selectedAddOns, setSelectedAddOns] = useState<Record<string, BookingAddOn>>({});

  const defaultPackage: VendorPackage = useMemo(() => ({
    id: "standard-service",
    vendor_id: vendorId,
    title: `${vendorCategory || "Wedding"} Full Day Service`,
    description: `Complete professional ${vendorCategory || "wedding"} service for your celebration with dedicated on-site team.`,
    price: 15000,
    discounted_price: 15000,
    price_type: "fixed",
    service_category: vendorCategory || "Wedding Service",
    duration_label: "Full Day",
    events_covered: 1,
    delivery_details: null,
    terms: null,
    status: "active",
    is_active: true,
    display_order: 1,
    image_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    items: [
      { item_type: "included", title: "Complete Event Coverage" },
      { item_type: "included", title: "Professional Team & Equipment" },
      { item_type: "included", title: "Dedicated Coordinator" },
    ],
  }), [vendorId, vendorCategory]);

  const activePackages = useMemo(() => {
    return packages.length > 0 ? packages : [defaultPackage];
  }, [packages, defaultPackage]);

  const palette = useMemo(
    () => ({
      surface: dark ? "#141B28" : "#FFFFFF",
      surfaceSoft: dark ? "#1E2738" : "#FFF7FA",
      surfaceHighlight: dark ? "#2B1A24" : "#FEEFF4",
      border: dark ? "#2A3548" : "#F2DDE5",
      borderActive: PINK,
      text: dark ? "#F8F4F6" : "#1B1317",
      muted: dark ? "#AFA4AA" : "#6E6268",
      primary: PINK,
      emeraldBg: dark ? "#064E3B" : "#ECFDF5",
      emeraldText: dark ? "#34D399" : "#059669",
    }),
    [dark]
  );

  const selectedPackagesList = useMemo(() => {
    return activePackages.filter((p) => selectedPackageIds.includes(p.id));
  }, [activePackages, selectedPackageIds]);

  const addOnsList = useMemo(() => Object.values(selectedAddOns), [selectedAddOns]);

  const financials = useMemo(() => {
    if (selectedPackagesList.length === 0) {
      return {
        packagesBaseTotal: 0,
        packagesTotal: 0,
        days: totalDays,
        addOnsTotal: 0,
        grandTotal: 0,
        totalAmount: 0,
        advanceAmount: 0,
        dueAmount: 0,
        advancePaise: 0,
        grandTotalPaise: 0,
      };
    }
    const packagesPrices = selectedPackagesList.map((p) => ({
      price: Number(p.discounted_price ?? p.price ?? 0),
    }));
    const res = calculateBookingFinancials(packagesPrices, totalDays, addOnsList);
    return {
      ...res,
      grandTotal: res.totalAmount,
    };
  }, [selectedPackagesList, totalDays, addOnsList]);

  const togglePackageSelection = (pkgId: string) => {
    setSelectedPackageIds((prev) => {
      if (prev.includes(pkgId)) {
        return prev.filter((id) => id !== pkgId);
      }
      return [...prev, pkgId];
    });
  };

  const toggleAddOn = (addonKey: string, addon: BookingAddOn) => {
    setSelectedAddOns((prev) => {
      const next = { ...prev };
      if (next[addonKey]) {
        delete next[addonKey];
      } else {
        next[addonKey] = addon;
      }
      return next;
    });
  };

  const handleBookNowClick = () => {
    if (selectedPackagesList.length === 0) {
      Alert.alert(
        "Select Service Package",
        "Please select at least one service package above to proceed with direct booking."
      );
      return;
    }
    onProceedToBook({
      selectedPackages: selectedPackagesList,
      selectedAddOns,
      startDate,
      endDate,
      totalDays,
      financials: {
        totalAmount: financials.totalAmount,
        advanceAmount: financials.advanceAmount,
        dueAmount: financials.dueAmount,
      },
    });
  };

  return (
    <View
      style={[
        styles.container,
        !desktop && styles.containerMobile,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      {/* 1. DATE SELECTOR / DISPLAYER (AT TOP) */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Change event dates on calendar"
        onPress={() => setDateModalVisible(true)}
        style={[
          styles.dateSelectorBox,
          !desktop && styles.dateSelectorBoxMobile,
          { backgroundColor: palette.surfaceSoft, borderColor: palette.border },
        ]}
      >
        <View style={styles.dateInfoLeft}>
          <View style={[styles.dateIconBubble, { backgroundColor: palette.surfaceHighlight }]}>
            <CalendarDays size={18} color={PINK} />
          </View>
          <View style={styles.dateTextGroup}>
            <Text style={[styles.dateEyebrow, { color: palette.muted }]}>EVENT DATE & DURATION (TAP TO OPEN CALENDAR)</Text>
            <Text style={[styles.dateTitle, { color: palette.text }]}>
              {formatDate(startDate)}
              {totalDays > 1 ? ` – ${formatDate(endDate)}` : ""}
            </Text>
            <View style={styles.daysBadgeRow}>
              <View style={[styles.daysPill, { backgroundColor: palette.surfaceHighlight }]}>
                <Text style={[styles.daysPillText, { color: PINK }]}>
                  {totalDays} {totalDays === 1 ? "Day Event" : "Days Event Duration"}
                </Text>
              </View>
              {totalDays > 1 ? (
                <Text style={[styles.daysMultiplierNote, { color: palette.muted }]}>
                  (Package × {totalDays} days)
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <View style={[styles.changeDateBtn, { borderColor: PINK }]}>
          <Text style={[styles.changeDateBtnText, { color: PINK }]}>Select Dates</Text>
        </View>
      </Pressable>

      {/* 2. THREE ACTION BUTTONS (MIDDLE) */}
      {desktop ? (
        <View style={styles.actionButtonsRow}>
          {/* Button 1: Check Availability */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Check availability calendar"
            onPress={() => setDateModalVisible(true)}
            style={[styles.actionBtn, styles.actionBtnSecondary, { borderColor: palette.border, backgroundColor: palette.surfaceSoft }]}
          >
            <CalendarDays size={16} color={palette.text} style={styles.actionBtnIcon} />
            <Text style={[styles.actionBtnText, { color: palette.text }]}>Check Availability</Text>
          </Pressable>

          {/* Button 2: Send Enquiry (Routed to Admin Only) */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send enquiry to admin"
            onPress={onSendEnquiry}
            style={[styles.actionBtn, styles.actionBtnSecondary, { borderColor: palette.border, backgroundColor: palette.surfaceSoft }]}
          >
            <Send size={15} color={palette.text} style={styles.actionBtnIcon} />
            <Text style={[styles.actionBtnText, { color: palette.text }]}>Send Enquiry</Text>
          </Pressable>

          {/* Button 3: Book Now */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Book now"
            onPress={handleBookNowClick}
            style={[styles.actionBtn, styles.actionBtnPrimary, { backgroundColor: PINK }]}
          >
            <PackageCheck size={16} color="#FFFFFF" style={styles.actionBtnIcon} />
            <Text style={styles.actionBtnPrimaryText}>Book Now</Text>
          </Pressable>
        </View>
      ) : (
        /* Mobile: Secondary Sister Actions (Equal 50/50, Single-Line Readable) */
        <View style={styles.mobileActionSecondaryRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Check availability calendar"
            onPress={() => setDateModalVisible(true)}
            style={[
              styles.mobileSecondaryBtn,
              { borderColor: palette.border, backgroundColor: palette.surfaceSoft },
            ]}
          >
            <CalendarDays size={14} color={palette.text} style={styles.mobileBtnIcon} />
            <Text style={[styles.mobileSecondaryBtnText, { color: palette.text }]} numberOfLines={1}>
              Check Availability
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send enquiry to admin"
            onPress={onSendEnquiry}
            style={[
              styles.mobileSecondaryBtn,
              { borderColor: palette.border, backgroundColor: palette.surfaceSoft },
            ]}
          >
            <Send size={13} color={palette.text} style={styles.mobileBtnIcon} />
            <Text style={[styles.mobileSecondaryBtnText, { color: palette.text }]} numberOfLines={1}>
              Send Enquiry
            </Text>
          </Pressable>
        </View>
      )}

      {/* 3. PACKAGE SELECTOR HEADER */}
      <View style={styles.packageSelectorHeader}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Select Service Packages</Text>
          <Text style={[styles.sectionSubtitle, { color: palette.muted }]} numberOfLines={1}>
            Choose one or more packages (30% advance payable)
          </Text>
        </View>
        {selectedPackageIds.length > 0 ? (
          <View style={[styles.selectedCountPill, { backgroundColor: palette.surfaceHighlight }]}>
            <Text style={[styles.selectedCountText, { color: PINK }]}>
              {selectedPackageIds.length} Selected ✓
            </Text>
          </View>
        ) : (
          <View style={[styles.selectedCountPill, { backgroundColor: palette.surfaceSoft, borderColor: palette.border, borderWidth: 1 }]}>
            <Text style={[styles.selectedCountText, { color: palette.muted }]}>
              Tap to Select
            </Text>
          </View>
        )}
      </View>

      {loadingPackages ? (
        <View style={styles.emptyCard}>
          <Text style={[styles.emptyCardText, { color: palette.muted }]}>Loading vendor packages...</Text>
        </View>
      ) : desktop ? (
        /* Desktop: Horizontal Carousel */
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalScrollContent}
        >
          {activePackages.map((item) => {
            const isSelected = selectedPackageIds.includes(item.id);
            const isExpanded = expandedPackageId === item.id;
            const effectivePrice = Number(item.discounted_price ?? item.price ?? 0);
            const includedItems = (item.items || []).filter((i) => i.item_type === "included");
            const addOnItems = (item.items || []).filter((i) => i.item_type === "add_on");

            return (
              <View
                key={item.id}
                style={[
                  styles.packageCard,
                  {
                    backgroundColor: isSelected ? palette.surfaceHighlight : palette.surfaceSoft,
                    borderColor: isSelected ? PINK : palette.border,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${isSelected ? "Deselect" : "Select"} package ${item.title}`}
                  onPress={() => togglePackageSelection(item.id)}
                  style={styles.packageCardBodyPressable}
                >
                  <View style={styles.packageCardTop}>
                    <View style={styles.selectorRowLeft}>
                      <View
                        style={[
                          styles.selectorDot,
                          {
                            borderColor: isSelected ? PINK : palette.muted,
                            backgroundColor: isSelected ? PINK : "transparent",
                          },
                        ]}
                      >
                        {isSelected ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
                      </View>
                      {isSelected ? (
                        <View style={[styles.selectedPill, { backgroundColor: PINK }]}>
                          <Text style={styles.selectedPillText}>SELECTED ✓</Text>
                        </View>
                      ) : (
                        <Text style={[styles.tapToSelectLabel, { color: palette.muted }]}>
                          Tap to select
                        </Text>
                      )}
                    </View>

                    <View style={styles.cardBadges}>
                      {item.service_category ? (
                        <View style={[styles.categoryBadge, { backgroundColor: palette.surface }]}>
                          <Text style={[styles.categoryBadgeText, { color: palette.muted }]}>
                            {item.service_category.toUpperCase()}
                          </Text>
                        </View>
                      ) : null}
                      <View style={[styles.advancePill, { backgroundColor: palette.emeraldBg }]}>
                        <Text style={[styles.advancePillText, { color: palette.emeraldText }]}>
                          30% ADV
                        </Text>
                      </View>
                    </View>
                  </View>

                  <Text style={[styles.packageTitle, { color: palette.text }]} numberOfLines={2}>
                    {item.title}
                  </Text>

                  <View style={styles.priceRow}>
                    <Text style={[styles.packagePrice, { color: palette.text }]}>
                      {money(effectivePrice)}
                    </Text>
                    <Text style={[styles.pricePerDay, { color: palette.muted }]}> / day</Text>
                    {item.discounted_price != null && item.price != null ? (
                      <Text style={[styles.strikethroughPrice, { color: palette.muted }]}>
                        {money(item.price)}
                      </Text>
                    ) : null}
                  </View>

                  {item.duration_label || item.events_covered ? (
                    <View style={styles.metaRow}>
                      <Clock size={12} color={palette.muted} />
                      <Text style={[styles.metaText, { color: palette.muted }]}>
                        {[item.duration_label, item.events_covered ? `${item.events_covered} Events` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Toggle package details"
                  onPress={() => setExpandedPackageId(isExpanded ? null : item.id)}
                  style={[styles.detailsDropdownBtn, { borderTopColor: palette.border }]}
                >
                  <Text style={[styles.detailsDropdownText, { color: PINK }]}>
                    {isExpanded ? "Hide Details" : "View Details & Add-ons"}
                  </Text>
                  {isExpanded ? (
                    <ChevronUp size={15} color={PINK} />
                  ) : (
                    <ChevronDown size={15} color={PINK} />
                  )}
                </Pressable>

                {isExpanded ? (
                  <View style={[styles.dropdownContent, { borderTopColor: palette.border }]}>
                    {item.description ? (
                      <Text style={[styles.packageDesc, { color: palette.muted }]}>
                        {item.description}
                      </Text>
                    ) : null}

                    {includedItems.length > 0 ? (
                      <View style={styles.servicesSection}>
                        <Text style={[styles.subSectionTitle, { color: palette.text }]}>
                          Included Services:
                        </Text>
                        {includedItems.map((inc) => (
                          <View key={inc.id} style={styles.serviceItemRow}>
                            <CheckCircle2 size={13} color="#168A5B" />
                            <Text style={[styles.serviceItemText, { color: palette.text }]}>
                              {inc.title}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}

                    {addOnItems.length > 0 ? (
                      <View style={styles.servicesSection}>
                        <Text style={[styles.subSectionTitle, { color: PINK }]}>
                          Optional Add-ons:
                        </Text>
                        {addOnItems.map((addon) => {
                          const addonKey = `${item.id}_${addon.id}`;
                          const isAddOnChecked = Boolean(selectedAddOns[addonKey]);
                          return (
                            <Pressable
                              key={addon.id}
                              onPress={() =>
                                toggleAddOn(addonKey, {
                                  id: addon.id,
                                  title: addon.title,
                                  price: Number(addon.price || 0),
                                })
                              }
                              style={styles.addOnRow}
                            >
                              <View
                                style={[
                                  styles.addOnCheckbox,
                                  {
                                    borderColor: isAddOnChecked ? PINK : palette.muted,
                                    backgroundColor: isAddOnChecked ? PINK : "transparent",
                                  },
                                ]}
                              >
                                {isAddOnChecked ? <Check size={10} color="#FFFFFF" /> : null}
                              </View>
                              <View style={styles.addOnDetails}>
                                <Text style={[styles.addOnTitle, { color: palette.text }]}>
                                  {addon.title}
                                </Text>
                                <Text style={[styles.addOnPrice, { color: PINK }]}>
                                  +{money(Number(addon.price || 0))}
                                </Text>
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}

                    {item.delivery_details ? (
                      <Text style={[styles.deliveryNote, { color: palette.muted }]}>
                        Delivery: {item.delivery_details}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      ) : (
        /* Mobile: Compact Vertical Stacked Card List with Accordion */
        <View style={styles.mobilePackageList}>
          {activePackages.map((item) => {
            const isSelected = selectedPackageIds.includes(item.id);
            const isExpanded = expandedPackageId === item.id;
            const effectivePrice = Number(item.discounted_price ?? item.price ?? 0);
            const includedItems = (item.items || []).filter((i) => i.item_type === "included");
            const addOnItems = (item.items || []).filter((i) => i.item_type === "add_on");

            return (
              <View
                key={item.id}
                style={[
                  styles.compactPackageCard,
                  {
                    backgroundColor: isSelected ? palette.surfaceHighlight : palette.surfaceSoft,
                    borderColor: isSelected ? PINK : palette.border,
                    borderWidth: isSelected ? 1.5 : 1,
                  },
                ]}
              >
                {/* Main Card Area - Tap anywhere to toggle selection */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${isSelected ? "Deselect" : "Select"} package ${item.title}`}
                  onPress={() => togglePackageSelection(item.id)}
                  style={styles.compactCardMainPressable}
                >
                  {/* Top Row: Custom Check Indicator + Package Title + Category + 30% Pill */}
                  <View style={styles.compactCardTopRow}>
                    <View style={styles.compactCardTitleGroup}>
                      <View
                        style={[
                          styles.compactSelectorDot,
                          {
                            borderColor: isSelected ? PINK : palette.muted,
                            backgroundColor: isSelected ? PINK : "transparent",
                          },
                        ]}
                      >
                        {isSelected ? <Check size={11} color="#FFFFFF" strokeWidth={3} /> : null}
                      </View>
                      <Text style={[styles.compactPackageTitle, { color: palette.text }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                    </View>

                    <View style={styles.compactCardBadges}>
                      {item.service_category ? (
                        <View style={[styles.compactCategoryBadge, { backgroundColor: palette.surface }]}>
                          <Text style={[styles.compactCategoryBadgeText, { color: palette.muted }]} numberOfLines={1}>
                            {item.service_category.toUpperCase()}
                          </Text>
                        </View>
                      ) : null}
                      <View style={[styles.compactAdvancePill, { backgroundColor: palette.emeraldBg }]}>
                        <Text style={[styles.compactAdvancePillText, { color: palette.emeraldText }]}>
                          30% ADV
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Middle Row: Price Display + Duration & Events Info */}
                  <View style={styles.compactCardMetaRow}>
                    <View style={styles.compactPriceRow}>
                      <Text style={[styles.compactPackagePrice, { color: palette.text }]}>
                        {money(effectivePrice)}
                      </Text>
                      <Text style={[styles.compactPricePerDay, { color: palette.muted }]}> / day</Text>
                      {item.discounted_price != null && item.price != null && item.price > effectivePrice ? (
                        <Text style={[styles.compactStrikethroughPrice, { color: palette.muted }]}>
                          {money(item.price)}
                        </Text>
                      ) : null}
                    </View>

                    {item.duration_label || item.events_covered ? (
                      <View style={styles.compactDurationPill}>
                        <Clock size={11} color={palette.muted} />
                        <Text style={[styles.compactDurationText, { color: palette.muted }]} numberOfLines={1}>
                          {[item.duration_label, item.events_covered ? `${item.events_covered} Events` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>

                {/* Bottom Accordion Bar: Toggles Details Expansion */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Toggle package details"
                  onPress={() => setExpandedPackageId(isExpanded ? null : item.id)}
                  style={[
                    styles.compactAccordionBar,
                    { borderTopColor: isSelected ? "rgba(225, 29, 72, 0.15)" : palette.border },
                  ]}
                >
                  <Text style={[styles.compactAccordionText, { color: PINK }]}>
                    {isExpanded ? "Hide Details & Add-ons" : "View Details & Add-ons"}
                  </Text>
                  {isExpanded ? (
                    <ChevronUp size={14} color={PINK} />
                  ) : (
                    <ChevronDown size={14} color={PINK} />
                  )}
                </Pressable>

                {/* Expandable Accordion Drawer */}
                {isExpanded ? (
                  <View style={[styles.compactExpandedDrawer, { borderTopColor: palette.border }]}>
                    {item.description ? (
                      <Text style={[styles.packageDesc, { color: palette.muted }]}>
                        {item.description}
                      </Text>
                    ) : null}

                    {includedItems.length > 0 ? (
                      <View style={styles.servicesSection}>
                        <Text style={[styles.subSectionTitle, { color: palette.text }]}>
                          Included Services:
                        </Text>
                        {includedItems.map((inc) => (
                          <View key={inc.id || inc.title} style={styles.serviceItemRow}>
                            <CheckCircle2 size={13} color="#168A5B" />
                            <Text style={[styles.serviceItemText, { color: palette.text }]}>
                              {inc.title}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}

                    {addOnItems.length > 0 ? (
                      <View style={styles.servicesSection}>
                        <Text style={[styles.subSectionTitle, { color: PINK }]}>
                          Optional Add-ons:
                        </Text>
                        {addOnItems.map((addon) => {
                          const addonKey = `${item.id}_${addon.id}`;
                          const isAddOnChecked = Boolean(selectedAddOns[addonKey]);
                          return (
                            <Pressable
                              key={addon.id}
                              onPress={() =>
                                toggleAddOn(addonKey, {
                                  id: addon.id,
                                  title: addon.title,
                                  price: Number(addon.price || 0),
                                })
                              }
                              style={styles.addOnRow}
                            >
                              <View
                                style={[
                                  styles.addOnCheckbox,
                                  {
                                    borderColor: isAddOnChecked ? PINK : palette.muted,
                                    backgroundColor: isAddOnChecked ? PINK : "transparent",
                                  },
                                ]}
                              >
                                {isAddOnChecked ? <Check size={10} color="#FFFFFF" /> : null}
                              </View>
                              <View style={styles.addOnDetails}>
                                <Text style={[styles.addOnTitle, { color: palette.text }]}>
                                  {addon.title}
                                </Text>
                                <Text style={[styles.addOnPrice, { color: PINK }]}>
                                  +{money(Number(addon.price || 0))}
                                </Text>
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}

                    {item.delivery_details ? (
                      <Text style={[styles.deliveryNote, { color: palette.muted }]}>
                        Delivery: {item.delivery_details}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      {/* MOBILE ONLY: PRIMARY BOOK NOW BUTTON (PLACED DIRECTLY BELOW SERVICE SELECTOR CARDS) */}
      {!desktop ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Book now"
          onPress={handleBookNowClick}
          style={[styles.mobilePrimaryBtn, { backgroundColor: PINK, marginTop: 14 }]}
        >
          <PackageCheck size={16} color="#FFFFFF" style={styles.mobileBtnIcon} />
          <Text style={styles.mobilePrimaryBtnText}>
            {selectedPackagesList.length > 0 ? "Book Selected Package" : "Book Now"}
          </Text>
          <View style={styles.mobilePrimaryAdvanceBadge}>
            <Text style={styles.mobilePrimaryAdvanceBadgeText}>
              {selectedPackagesList.length > 0
                ? `Pay 30% Adv: ${money(financials.advanceAmount)}`
                : "30% Advance"}
            </Text>
          </View>
        </Pressable>
      ) : null}

      {/* 4. LIVE PRICES SUMMARY BOX (DESKTOP ONLY - REMOVED DUPLICATE FROM MOBILE VIEW) */}
      {desktop && selectedPackagesList.length > 0 ? (
        <View
          style={[
            styles.summaryBox,
            { backgroundColor: palette.surfaceSoft, borderColor: palette.border },
          ]}
        >
          <View style={styles.summaryTop}>
            <View style={styles.summaryTitleGroup}>
              <Sparkles size={16} color={PINK} />
              <Text style={[styles.summaryTitle, { color: palette.text }]}>Booking Summary</Text>
            </View>
            <View style={[styles.daysDurationPill, { backgroundColor: palette.surfaceHighlight }]}>
              <Text style={[styles.daysDurationText, { color: PINK }]}>
                {totalDays} {totalDays === 1 ? "Day" : "Days"} × {selectedPackagesList.length}{" "}
                {selectedPackagesList.length === 1 ? "Package" : "Packages"}
              </Text>
            </View>
          </View>

          {/* Itemized Packages Breakdown */}
          <View style={styles.itemizedList}>
            {selectedPackagesList.map((pkg) => (
              <View key={pkg.id} style={styles.summaryLine}>
                <Text style={[styles.summaryLineLabel, { color: palette.muted }]}>
                  {pkg.title}
                </Text>
                <Text style={[styles.summaryLineValue, { color: palette.text }]}>
                  {money(Number(pkg.discounted_price ?? pkg.price ?? 0))}
                </Text>
              </View>
            ))}

            {totalDays > 1 ? (
              <View style={styles.summaryLine}>
                <Text style={[styles.summaryLineLabel, { color: PINK }]}>
                  Duration Multiplier ({totalDays} Days)
                </Text>
                <Text style={[styles.summaryLineValue, { color: PINK }]}>
                  {money(financials.packagesTotal)}
                </Text>
              </View>
            ) : null}

            {addOnsList.length > 0 ? (
              <View style={styles.summaryLine}>
                <Text style={[styles.summaryLineLabel, { color: palette.muted }]}>
                  Add-ons ({addOnsList.length} items)
                </Text>
                <Text style={[styles.summaryLineValue, { color: palette.text }]}>
                  +{money(financials.addOnsTotal)}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={[styles.summaryDivider, { backgroundColor: palette.border }]} />

          {/* Financial Breakdown Panel */}
          <View style={styles.financialRow}>
            <View>
              <Text style={[styles.finSmallLabel, { color: palette.muted }]}>Total Amount</Text>
              <Text style={[styles.finTotalAmount, { color: palette.text }]}>
                {money(financials.totalAmount)}
              </Text>
            </View>

            <View style={styles.splitBox}>
              {/* Advance 30% */}
              <View style={[styles.splitItem, { backgroundColor: palette.emeraldBg }]}>
                <Text style={[styles.splitLabel, { color: palette.emeraldText }]}>
                  30% ADVANCE PAYABLE
                </Text>
                <Text style={[styles.splitValue, { color: palette.emeraldText }]}>
                  {money(financials.advanceAmount)}
                </Text>
              </View>

              {/* Due 70% */}
              <View style={[styles.splitItem, { backgroundColor: palette.surfaceHighlight }]}>
                <Text style={[styles.splitLabel, { color: palette.muted }]}>
                  70% DUE AT EVENT
                </Text>
                <Text style={[styles.splitValue, { color: palette.text }]}>
                  {money(financials.dueAmount)}
                </Text>
              </View>
            </View>
          </View>

          {/* Primary CTA Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Proceed to book"
            onPress={handleBookNowClick}
            style={[styles.proceedBtn, { backgroundColor: PINK }]}
          >
            <PackageCheck size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.proceedBtnText}>
              Proceed to Book (Pay 30% Adv: {money(financials.advanceAmount)})
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* COMPLETE INTERACTIVE EVENT CALENDAR MODAL */}
      <BookingCalendarModal
        visible={dateModalVisible}
        vendorId={vendorId}
        vendorName={vendorName}
        initialStartDate={startDate}
        initialEndDate={endDate}
        dark={dark}
        onClose={() => setDateModalVisible(false)}
        onConfirmDates={(selected) => {
          setStartDate(selected.startDate);
          setTotalDays(selected.totalDays);
          setDateModalVisible(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
    ...Platform.select({
      web: { boxShadow: "0 6px 20px rgba(180, 80, 110, 0.08)" },
      default: { elevation: 2 },
    }),
  },
  containerMobile: {
    padding: 12,
    borderRadius: 16,
    marginBottom: 16,
  },
  dateSelectorBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  dateSelectorBoxMobile: {
    padding: 11,
    borderRadius: 12,
    marginBottom: 12,
  },
  dateInfoLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 10,
  },
  dateIconBubble: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  dateTextGroup: {
    flex: 1,
  },
  dateEyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  dateTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  daysBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  daysPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  daysPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  daysMultiplierNote: {
    fontSize: 11,
  },
  changeDateBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  changeDateBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionBtnSecondary: {
    borderWidth: 1,
  },
  actionBtnPrimary: {
    elevation: 3,
  },
  actionBtnIcon: {
    marginRight: 6,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  actionBtnPrimaryText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  mobileActionSecondaryRow: {
    flexDirection: "row",
    gap: 8,
    width: "100%",
    marginBottom: 16,
  },
  mobileSecondaryBtn: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    gap: 6,
  },
  mobileSecondaryBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  mobilePrimaryBtn: {
    width: "100%",
    height: 44,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 2,
    ...Platform.select({
      web: { boxShadow: "0 4px 12px rgba(225, 29, 72, 0.25)" },
      default: { elevation: 3 },
    }),
  },
  mobilePrimaryBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  mobilePrimaryAdvanceBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.22)",
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
    marginLeft: "auto",
  },
  mobilePrimaryAdvanceBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  mobileBtnIcon: {
    flexShrink: 0,
  },
  packageSelectorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  sectionSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  selectedCountPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  selectedCountText: {
    fontSize: 11,
    fontWeight: "800",
  },
  horizontalScrollContent: {
    paddingVertical: 4,
    paddingRight: 16,
    gap: 14,
  },
  packageCard: {
    width: 290,
    borderRadius: 16,
    padding: 14,
  },
  packageCardBodyPressable: {
    paddingBottom: 4,
  },
  packageCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  selectorRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  selectorDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  selectedPillText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  tapToSelectLabel: {
    fontSize: 10,
    fontWeight: "700",
  },
  cardBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryBadgeText: {
    fontSize: 9,
    fontWeight: "700",
  },
  advancePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  advancePillText: {
    fontSize: 10,
    fontWeight: "800",
  },
  packageTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 6,
    minHeight: 38,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 6,
  },
  packagePrice: {
    fontSize: 18,
    fontWeight: "800",
  },
  pricePerDay: {
    fontSize: 12,
    fontWeight: "600",
  },
  strikethroughPrice: {
    fontSize: 12,
    textDecorationLine: "line-through",
    marginLeft: 6,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 10,
  },
  metaText: {
    fontSize: 11,
  },
  detailsDropdownBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
  },
  detailsDropdownText: {
    fontSize: 12,
    fontWeight: "700",
  },
  dropdownContent: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  packageDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 8,
  },
  servicesSection: {
    marginTop: 6,
    marginBottom: 8,
  },
  subSectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 4,
  },
  serviceItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  serviceItemText: {
    fontSize: 11,
  },
  addOnRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  addOnCheckbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  addOnDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    flex: 1,
  },
  addOnTitle: {
    fontSize: 11,
  },
  addOnPrice: {
    fontSize: 11,
    fontWeight: "700",
  },
  deliveryNote: {
    fontSize: 10,
    fontStyle: "italic",
    marginTop: 4,
  },
  // Mobile Compact Package Card List
  mobilePackageList: {
    flexDirection: "column",
    gap: 10,
  },
  compactPackageCard: {
    borderRadius: 14,
    overflow: "hidden",
  },
  compactCardMainPressable: {
    padding: 12,
  },
  compactCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  compactCardTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  compactSelectorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  compactPackageTitle: {
    fontSize: 14,
    fontWeight: "800",
    flex: 1,
  },
  compactCardBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 0,
  },
  compactCategoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  compactCategoryBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  compactAdvancePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  compactAdvancePillText: {
    fontSize: 9,
    fontWeight: "800",
  },
  compactCardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingLeft: 28,
  },
  compactPriceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexShrink: 0,
  },
  compactPackagePrice: {
    fontSize: 16,
    fontWeight: "800",
  },
  compactPricePerDay: {
    fontSize: 11,
    fontWeight: "600",
  },
  compactStrikethroughPrice: {
    fontSize: 11,
    textDecorationLine: "line-through",
    marginLeft: 6,
  },
  compactDurationPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
  },
  compactDurationText: {
    fontSize: 11,
  },
  compactAccordionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderTopWidth: 1,
  },
  compactAccordionText: {
    fontSize: 11,
    fontWeight: "700",
  },
  compactExpandedDrawer: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  summaryBox: {
    marginTop: 18,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  summaryTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  summaryTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  daysDurationPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  daysDurationText: {
    fontSize: 11,
    fontWeight: "700",
  },
  itemizedList: {
    gap: 4,
  },
  summaryLine: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryLineLabel: {
    fontSize: 12,
  },
  summaryLineValue: {
    fontSize: 12,
    fontWeight: "700",
  },
  summaryDivider: {
    height: 1,
    marginVertical: 12,
  },
  financialRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
    flexWrap: "wrap",
    gap: 12,
  },
  finSmallLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  finTotalAmount: {
    fontSize: 22,
    fontWeight: "800",
  },
  splitBox: {
    flexDirection: "row",
    gap: 8,
  },
  splitItem: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: "center",
  },
  splitLabel: {
    fontSize: 9,
    fontWeight: "800",
  },
  splitValue: {
    fontSize: 14,
    fontWeight: "800",
    marginTop: 2,
  },
  proceedBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
  },
  proceedBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  emptySummaryBox: {
    marginTop: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  emptySummaryIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  emptySummaryTextWrap: {
    flex: 1,
  },
  emptySummaryHeading: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 2,
  },
  emptySummarySubtext: {
    fontSize: 12,
    lineHeight: 16,
  },
  emptyCard: {
    padding: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  emptyCardText: {
    fontSize: 13,
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalBox: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 4,
  },
  modalSub: {
    fontSize: 12,
    marginBottom: 16,
  },
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  counterLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  counterControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  counterBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  counterNumber: {
    fontSize: 18,
    fontWeight: "800",
    minWidth: 24,
    textAlign: "center",
  },
  datePreviewBox: {
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 16,
  },
  datePreviewText: {
    fontSize: 13,
    fontWeight: "700",
  },
  modalDoneBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  modalDoneBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
