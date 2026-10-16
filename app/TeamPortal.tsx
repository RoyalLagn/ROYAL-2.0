import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownUp,
  Award,
  Ban,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDollarSign,
  CircleX,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Filter,
  HandCoins,
  History,
  Lock,
  LogOut,
  Menu,
  QrCode,
  ReceiptText,
  RefreshCw,
  Search,
  Share2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Target,
  Ticket,
  Unlock,
  User,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  Wallet,
  X,
  XCircle,
} from "lucide-react-native";
import { adminPalette } from "@/theme";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { royalAdmin, royalAdminThemeVars } from "@/components/admin/dashboard/adminDashboardTheme";
import { useAppTheme } from "@/components/ThemeProvider";
import { TeamAuthProvider, useTeamAuth } from "@/context/TeamAuthContext";
import {
  TeamQueuesService,
  TeamPaymentDestinationItem,
  TeamWithdrawalItem,
  TeamVendorApplicationItem,
  QueueAssignmentFilter,
} from "@/services/teamQueues";
import { TeamManagementService } from "@/services/teamManagement";
import {
  TEAM_PERMISSIONS,
  TEAM_PERMISSION_LABELS,
  TeamMembership,
  TeamPermission,
  TeamPortalOverview,
  TeamActivityLogEntry,
  VendorChecklist,
} from "@/types/team";
import { supabase } from "@/services/supabase";

const pink = adminPalette.brand;
const money = (val?: number | null) => `₹${Number(val || 0).toLocaleString("en-IN")}`;

type PortalTab =
  | "overview"
  | "verifications"
  | "withdrawals"
  | "vendors"
  | "workspaces"
  | "activity"
  | "team";

function TeamPortalInner() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isSmall = width < 420;
  const { colorScheme } = useAppTheme();
  const dark = colorScheme === "dark";
  const {
    user,
    membership,
    loading: authLoading,
    isTeamMember,
    canVerifyPayments,
    canHandleFinance,
    canVerifyVendors,
    isMarketing,
    isManager,
    isAdmin,
    signIn,
    signOut,
    refresh: refreshAuth,
  } = useTeamAuth();

  // Embedded Team Sign In state
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  const handleSignInSubmit = async () => {
    if (!signInEmail.trim()) {
      setSignInError("Please enter your team email address.");
      return;
    }
    if (!signInPassword) {
      setSignInError("Please enter your password.");
      return;
    }
    setSigningIn(true);
    setSignInError(null);
    const res = await signIn(signInEmail, signInPassword);
    setSigningIn(false);
    if (!res.success) {
      setSignInError(res.error || "Unable to sign in. Please verify your credentials.");
    }
  };

  // Navigation tab state
  const [activeTab, setActiveTab] = useState<PortalTab>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Overview metrics
  const [overview, setOverview] = useState<TeamPortalOverview | null>(null);
  const [overviewPopup, setOverviewPopup] = useState<"verifications" | "withdrawals" | "vendors" | "sla" | null>(null);

  // Tab 2: Verifications Queue
  const [destinations, setDestinations] = useState<TeamPaymentDestinationItem[]>([]);
  const [destAssignmentFilter, setDestAssignmentFilter] = useState<QueueAssignmentFilter>("all");
  const [destStatusFilter, setDestStatusFilter] = useState<string>("pending");
  const [destSearch, setDestSearch] = useState("");

  // Tab 3: Withdrawals Queue
  const [withdrawals, setWithdrawals] = useState<TeamWithdrawalItem[]>([]);
  const [withAssignmentFilter, setWithAssignmentFilter] = useState<any>("all");
  const [withStatusFilter, setWithStatusFilter] = useState<string>("requested");
  const [withSearch, setWithSearch] = useState("");

  // Tab 4: Vendor Verifications Queue
  const [vendorApps, setVendorApps] = useState<TeamVendorApplicationItem[]>([]);
  const [vendorAssignmentFilter, setVendorAssignmentFilter] = useState<QueueAssignmentFilter>("all");
  const [vendorStatusFilter, setVendorStatusFilter] = useState<string>("pending");
  const [vendorSearch, setVendorSearch] = useState("");

  // Tab 5: Workspaces / Campaigns
  const [workspaces, setWorkspaces] = useState<any[]>([]);

  // Tab 6: Activity Logs
  const [activityLogs, setActivityLogs] = useState<TeamActivityLogEntry[]>([]);

  // Tab 7: Team Members (Manager/Admin)
  const [teamMembers, setTeamMembers] = useState<TeamMembership[]>([]);

  // Navigation tabs configuration
  const mobileTabWidth = Math.max(88, Math.floor((width - 36) / 3));
  const mobileKpiCardWidth = Math.max(140, Math.floor((width - 32) / 2));
  const tabsList = useMemo(() => {
    const list: {
      id: PortalTab;
      label: string;
      mobileLabel: string;
      icon: any;
      visible: boolean;
      badge?: number;
      badgeColor?: string;
    }[] = [
      {
        id: "overview",
        label: "Overview",
        mobileLabel: "Overview",
        icon: Target,
        visible: true,
      },
      {
        id: "verifications",
        label: "Payment Verification",
        mobileLabel: "Verification",
        icon: QrCode,
        visible: canVerifyPayments || isAdmin,
        badge: overview?.destinations.pending,
        badgeColor: "bg-emerald-500",
      },
      {
        id: "withdrawals",
        label: "Withdrawals & Payouts",
        mobileLabel: "Withdrawals",
        icon: CircleDollarSign,
        visible: canHandleFinance || isAdmin,
        badge: overview?.withdrawals.pending,
        badgeColor: "bg-blue-500",
      },
      {
        id: "vendors",
        label: "Vendor Approvals",
        mobileLabel: "Vendors",
        icon: Building2,
        visible: canVerifyVendors || isAdmin,
        badge: overview?.vendors.pending,
        badgeColor: "bg-amber-500",
      },
      {
        id: "workspaces",
        label: "Workspaces & Campaigns",
        mobileLabel: "Workspaces",
        icon: Tag,
        visible: isMarketing || isManager || isAdmin,
      },
      {
        id: "activity",
        label: "Activity Log",
        mobileLabel: "Activity",
        icon: History,
        visible: true,
      },
      {
        id: "team",
        label: "Team Management",
        mobileLabel: "Team",
        icon: Users,
        visible: isManager || isAdmin,
      },
    ];
    return list.filter((tab) => tab.visible);
  }, [
    canVerifyPayments,
    canHandleFinance,
    canVerifyVendors,
    isMarketing,
    isManager,
    isAdmin,
    overview?.destinations.pending,
    overview?.withdrawals.pending,
    overview?.vendors.pending,
  ]);

  const totalPendingBadges = useMemo(() => {
    let count = 0;
    if (canVerifyPayments || isAdmin) count += overview?.destinations.pending ?? 0;
    if (canHandleFinance || isAdmin) count += overview?.withdrawals.pending ?? 0;
    if (canVerifyVendors || isAdmin) count += overview?.vendors.pending ?? 0;
    return count;
  }, [canVerifyPayments, canHandleFinance, canVerifyVendors, isAdmin, overview]);

  const currentTabConfig = useMemo(
    () => tabsList.find((t) => t.id === activeTab) || tabsList[0],
    [tabsList, activeTab]
  );

  // Quick Filter Bottom Sheet for Mobile
  const [filterSheetConfig, setFilterSheetConfig] = useState<{
    title: string;
    subtitle?: string;
    options: { id: string; label: string; count?: number }[];
    selectedId: string;
    onSelect: (id: string) => void;
  } | null>(null);

  const destStatusLabel = useMemo(() => {
    switch (destStatusFilter) {
      case "pending": return "Pending";
      case "approved": return "Approved";
      case "changes_required": return "Rejected";
      case "all": return "All";
      default: return destStatusFilter;
    }
  }, [destStatusFilter]);

  const destAssignmentLabel = useMemo(() => {
    switch (destAssignmentFilter) {
      case "all": return "All";
      case "my_assigned": return "Mine";
      case "unassigned": return "Unassigned";
      case "overdue": return "Overdue";
      case "escalated": return "Escalated";
      default: return destAssignmentFilter;
    }
  }, [destAssignmentFilter]);

  const withStatusLabel = useMemo(() => {
    switch (withStatusFilter) {
      case "requested": return "Requested";
      case "processing": return "Processing";
      case "payment_pending": return "Pending";
      case "paid": return "Paid";
      case "rejected": return "Rejected";
      case "all": return "All";
      default: return withStatusFilter;
    }
  }, [withStatusFilter]);

  const withAssignmentLabel = useMemo(() => {
    switch (withAssignmentFilter) {
      case "all": return "All";
      case "my_assigned": return "Mine";
      case "unassigned": return "Unassigned";
      case "pending_second_approval": return "2nd Approval";
      case "overdue": return "Overdue";
      case "escalated": return "Escalated";
      default: return withAssignmentFilter;
    }
  }, [withAssignmentFilter]);

  const vendorStatusLabel = useMemo(() => {
    switch (vendorStatusFilter) {
      case "pending": return "Pending";
      case "approved": return "Approved";
      case "rejected": return "Rejected";
      case "all": return "All";
      default: return vendorStatusFilter;
    }
  }, [vendorStatusFilter]);

  const vendorAssignmentLabel = useMemo(() => {
    switch (vendorAssignmentFilter) {
      case "all": return "All";
      case "my_assigned": return "Mine";
      case "unassigned": return "Unassigned";
      default: return vendorAssignmentFilter;
    }
  }, [vendorAssignmentFilter]);

  // Modals state
  // Verification Review Modal
  const [verifyModalItem, setVerifyModalItem] = useState<TeamPaymentDestinationItem | null>(null);
  const [observedNameInput, setObservedNameInput] = useState("");
  const [verifyNotesInput, setVerifyNotesInput] = useState("");
  const [rejectionReasonInput, setRejectionReasonInput] = useState("");
  const [nameMatchesCheck, setNameMatchesCheck] = useState(false);
  const [mobileMatchesCheck, setMobileMatchesCheck] = useState(false);
  const [qrModalUrl, setQrModalUrl] = useState<string | null>(null);

  // Withdrawal 2nd Approval Modal
  const [secondApproveItem, setSecondApproveItem] = useState<TeamWithdrawalItem | null>(null);
  const [secondApproveNotes, setSecondApproveNotes] = useState("");

  // Payout Execution Modal
  const [payoutExecItem, setPayoutExecItem] = useState<TeamWithdrawalItem | null>(null);
  const [payoutStatusTab, setPayoutStatusTab] = useState<"processing" | "payment_pending" | "paid">("processing");
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [utrInput, setUtrInput] = useState("");
  const [sourceAccountInput, setSourceAccountInput] = useState("RoyalLagn Business Account");
  const [payoutNotesInput, setPayoutNotesInput] = useState("");
  const [payoutProofUrlInput, setPayoutProofUrlInput] = useState("");

  // Vendor Review Modal
  const [vendorModalItem, setVendorModalItem] = useState<TeamVendorApplicationItem | null>(null);
  const [vendorRec, setVendorRec] = useState<"recommended_approval" | "recommended_rejection" | "needs_clarification">("recommended_approval");
  const [vendorNotes, setVendorNotes] = useState("");
  const [vendorChecklist, setVendorChecklist] = useState<VendorChecklist>({
    identityVerified: false,
    locationCoverageVerified: false,
    portfolioAuthentic: false,
    categoryMatched: false,
  });

  // Reassignment Modal
  const [reassignModalTarget, setReassignModalTarget] = useState<{ queueType: any; requestId: string } | null>(null);
  const [selectedAssignee, setSelectedAssignee] = useState<string>("");

  // Escalation Modal
  const [escalateModalTarget, setEscalateModalTarget] = useState<{ queueType: any; requestId: string } | null>(null);
  const [escalationReason, setEscalationReason] = useState("");

  // Member Management Modal
  const [memberModalItem, setMemberModalItem] = useState<TeamMembership | null>(null);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberFullName, setMemberFullName] = useState("");
  const [memberPhone, setMemberPhone] = useState("");
  const [memberPermissions, setMemberPermissions] = useState<TeamPermission[]>([]);
  const [memberIsActive, setMemberIsActive] = useState(true);

  // Load data for active tab
  const loadTabContent = useCallback(async () => {
    setLoading(true);
    try {
      const ov = await TeamQueuesService.getOverview();
      setOverview(ov);

      if (activeTab === "overview") {
        const logs = await TeamManagementService.getActivityLogs(10);
        setActivityLogs(logs);

        if (overviewPopup === "verifications" && (canVerifyPayments || isAdmin)) {
          const list = await TeamQueuesService.listPaymentDestinations({
            status: destStatusFilter,
            assignment: destAssignmentFilter,
            query: destSearch,
            currentUserId: membership?.userId,
          });
          setDestinations(list);
        } else if (overviewPopup === "withdrawals" && (canHandleFinance || isAdmin)) {
          const list = await TeamQueuesService.listWithdrawals({
            status: withStatusFilter,
            assignment: withAssignmentFilter,
            query: withSearch,
            currentUserId: membership?.userId,
          });
          setWithdrawals(list);
        } else if (overviewPopup === "vendors" && (canVerifyVendors || isAdmin)) {
          const list = await TeamQueuesService.listVendorApplications({
            status: vendorStatusFilter,
            assignment: vendorAssignmentFilter,
            query: vendorSearch,
            currentUserId: membership?.userId,
          });
          setVendorApps(list);
        }
      } else if (activeTab === "verifications" && (canVerifyPayments || isAdmin)) {
        const list = await TeamQueuesService.listPaymentDestinations({
          status: destStatusFilter,
          assignment: destAssignmentFilter,
          query: destSearch,
          currentUserId: membership?.userId,
        });
        setDestinations(list);
      } else if (activeTab === "withdrawals" && (canHandleFinance || isAdmin)) {
        const list = await TeamQueuesService.listWithdrawals({
          status: withStatusFilter,
          assignment: withAssignmentFilter,
          query: withSearch,
          currentUserId: membership?.userId,
        });
        setWithdrawals(list);
      } else if (activeTab === "vendors" && (canVerifyVendors || isAdmin)) {
        const list = await TeamQueuesService.listVendorApplications({
          status: vendorStatusFilter,
          assignment: vendorAssignmentFilter,
          query: vendorSearch,
          currentUserId: membership?.userId,
        });
        setVendorApps(list);
      } else if (activeTab === "workspaces") {
        const { data } = await supabase.from("crm_marketing_workspaces").select("*").order("created_at", { ascending: false });
        setWorkspaces(data || []);
      } else if (activeTab === "activity") {
        const logs = await TeamManagementService.getActivityLogs(50);
        setActivityLogs(logs);
      } else if (activeTab === "team" && (isManager || isAdmin)) {
        const members = await TeamManagementService.listTeamMembers();
        setTeamMembers(members);
      }
    } catch (err) {
      console.error("loadTabContent error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [
    activeTab,
    overviewPopup,
    canVerifyPayments,
    canHandleFinance,
    canVerifyVendors,
    isManager,
    isAdmin,
    destStatusFilter,
    destAssignmentFilter,
    destSearch,
    withStatusFilter,
    withAssignmentFilter,
    withSearch,
    vendorStatusFilter,
    vendorAssignmentFilter,
    vendorSearch,
    membership?.userId,
  ]);

  useEffect(() => {
    if (isTeamMember) {
      void loadTabContent();
      const unsubscribe = TeamQueuesService.subscribeToTeamQueuesRealtime(() => {
        void loadTabContent();
      });
      return () => {
        unsubscribe();
      };
    }
  }, [isTeamMember, loadTabContent]);

  // Tab Permissions Guard: If user doesn't have access to current tab, redirect to overview
  useEffect(() => {
    if (activeTab === "verifications" && !canVerifyPayments && !isAdmin) setActiveTab("overview");
    if (activeTab === "withdrawals" && !canHandleFinance && !isAdmin) setActiveTab("overview");
    if (activeTab === "vendors" && !canVerifyVendors && !isAdmin) setActiveTab("overview");
    if (activeTab === "team" && !isManager && !isAdmin) setActiveTab("overview");
  }, [activeTab, canVerifyPayments, canHandleFinance, canVerifyVendors, isManager, isAdmin]);

  // Claim handler
  const handleClaim = async (queueType: "payment_destination" | "withdrawal" | "vendor_application", id: string) => {
    setActionInProgress(id);
    const res = await TeamQueuesService.claimRequest(queueType, id);
    setActionInProgress(null);
    if (!res.success) {
      Alert.alert("Unable to claim", res.message || "Request may have been claimed by another teammate.");
    } else {
      void loadTabContent();
    }
  };

  // Release handler
  const handleRelease = async (queueType: "payment_destination" | "withdrawal" | "vendor_application", id: string) => {
    setActionInProgress(id);
    const res = await TeamQueuesService.releaseClaim(queueType, id);
    setActionInProgress(null);
    if (!res.success) {
      Alert.alert("Unable to release", res.message);
    } else {
      void loadTabContent();
    }
  };

  // Escalate handler
  const handleEscalateSubmit = async () => {
    if (!escalateModalTarget || !escalationReason.trim()) {
      Alert.alert("Required", "Please provide a reason for escalation.");
      return;
    }
    setActionInProgress(escalateModalTarget.requestId);
    const res = await TeamQueuesService.escalateRequest(
      escalateModalTarget.queueType,
      escalateModalTarget.requestId,
      escalationReason.trim()
    );
    setActionInProgress(null);
    setEscalateModalTarget(null);
    setEscalationReason("");
    if (!res.success) {
      Alert.alert("Escalation failed", res.message);
    } else {
      Alert.alert("Escalated", "Request escalated to manager/admin successfully.");
      void loadTabContent();
    }
  };

  // Reassign handler
  const handleReassignSubmit = async () => {
    if (!reassignModalTarget || !selectedAssignee) {
      Alert.alert("Required", "Please select a team member to assign this request to.");
      return;
    }
    setActionInProgress(reassignModalTarget.requestId);
    const res = await TeamQueuesService.assignRequest(
      reassignModalTarget.queueType,
      reassignModalTarget.requestId,
      selectedAssignee
    );
    setActionInProgress(null);
    setReassignModalTarget(null);
    setSelectedAssignee("");
    if (!res.success) {
      Alert.alert("Reassignment failed", res.message);
    } else {
      Alert.alert("Reassigned", "Request reassigned successfully.");
      void loadTabContent();
    }
  };

  // Payment Verification Review Submit
  const handleVerifySubmit = async (decision: "approved" | "changes_required") => {
    if (!verifyModalItem) return;
    if (decision === "approved") {
      if (!nameMatchesCheck || !mobileMatchesCheck) {
        Alert.alert("Incomplete Checklist", "Please confirm all verification checklist items before approving.");
        return;
      }
      if (!observedNameInput.trim()) {
        Alert.alert("Required", "Please record the observed recipient name observed in the payment app.");
        return;
      }
    } else {
      if (!rejectionReasonInput.trim()) {
        Alert.alert("Required", "Please provide a specific reason explaining why changes are required.");
        return;
      }
    }

    setActionInProgress(verifyModalItem.id);
    const res = await TeamQueuesService.reviewPaymentDestination(
      verifyModalItem.id,
      decision,
      observedNameInput,
      verifyNotesInput,
      rejectionReasonInput
    );
    setActionInProgress(null);
    if (!res.success) {
      Alert.alert("Verification failed", res.message);
    } else {
      Alert.alert(
        decision === "approved" ? "Verification Approved" : "Changes Requested",
        decision === "approved"
          ? "Payment details verified and approved. Customer is now eligible for withdrawals."
          : "Customer notified to correct payment details."
      );
      setVerifyModalItem(null);
      setObservedNameInput("");
      setVerifyNotesInput("");
      setRejectionReasonInput("");
      setNameMatchesCheck(false);
      setMobileMatchesCheck(false);
      void loadTabContent();
    }
  };

  // Withdrawal 2nd Approval Submit
  const handleSecondApproveSubmit = async () => {
    if (!secondApproveItem) return;
    setActionInProgress(secondApproveItem.id);
    const res = await TeamQueuesService.secondApprovePayout(secondApproveItem.id, secondApproveNotes);
    setActionInProgress(null);
    if (!res.success) {
      Alert.alert("Approval failed", res.message);
    } else {
      Alert.alert("Approved", "Second approval granted. Finance operator can now execute the payout.");
      setSecondApproveItem(null);
      setSecondApproveNotes("");
      void loadTabContent();
    }
  };

  const handleCopyText = async (text: string, label: string) => {
    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        await Clipboard.setStringAsync(text);
      }
      setCopyToast(`${label} copied!`);
      setTimeout(() => setCopyToast(null), 2500);
    } catch {
      Alert.alert("Copied", `${label}: ${text}`);
    }
  };

  // Payout Execution / Status Submit
  const handlePayoutExecSubmit = async () => {
    if (!payoutExecItem) return;

    if (payoutStatusTab === "paid" && !utrInput.trim()) {
      Alert.alert("UTR / Reference Required", "Please enter the bank UTR or transaction reference number to complete and deduct referral balance.");
      return;
    }

    setActionInProgress(payoutExecItem.id);
    const res = await TeamQueuesService.updatePayoutStatus(
      payoutExecItem.id,
      payoutStatusTab,
      utrInput,
      sourceAccountInput,
      payoutNotesInput,
      payoutProofUrlInput
    );
    setActionInProgress(null);
    if (!res.success) {
      Alert.alert("Action Failed", res.message || "Failed to update payout status");
    } else {
      if (payoutStatusTab === "paid") {
        Alert.alert(
          "Payout Completed",
          `Withdrawal of ${money(payoutExecItem.amount)} marked as Paid. Respective amount deducted from customer referral balance and customer notified.`
        );
      } else if (payoutStatusTab === "processing") {
        Alert.alert("Status Updated", "Withdrawal marked as Processing Payment.");
      } else {
        Alert.alert("Status Updated", "Withdrawal marked as Payment Pending.");
      }
      setPayoutExecItem(null);
      setUtrInput("");
      setPayoutNotesInput("");
      setPayoutProofUrlInput("");
      void loadTabContent();
    }
  };

  // Vendor Recommendation Submit
  const handleVendorRecSubmit = async () => {
    if (!vendorModalItem) return;
    setActionInProgress(vendorModalItem.id);
    const res = await TeamQueuesService.recommendVendorApplication(
      vendorModalItem.id,
      vendorRec,
      vendorNotes,
      vendorChecklist
    );
    setActionInProgress(null);
    if (!res.success) {
      Alert.alert("Recommendation failed", res.message);
    } else {
      Alert.alert("Recommendation Submitted", "Vendor verifier evaluation recorded for manager review.");
      setVendorModalItem(null);
      setVendorNotes("");
      void loadTabContent();
    }
  };

  // Vendor Final Decision Submit (Manager/Admin)
  const handleVendorDecision = async (decision: "approved" | "rejected", reason?: string) => {
    if (!vendorModalItem) return;
    setActionInProgress(vendorModalItem.id);
    const res = await TeamQueuesService.decideVendorApplication(vendorModalItem.id, decision, reason);
    setActionInProgress(null);
    if (!res.success) {
      Alert.alert("Decision failed", res.message);
    } else {
      Alert.alert(decision === "approved" ? "Vendor Approved" : "Application Rejected", "Marketplace status updated.");
      setVendorModalItem(null);
      void loadTabContent();
    }
  };

  // Member Management Save
  const handleSaveMember = async () => {
    if (!memberEmail.trim() || !memberFullName.trim()) {
      Alert.alert("Required", "Email and Full Name are required.");
      return;
    }
    setActionInProgress("member_save");
    const userIdToUse = memberModalItem ? memberModalItem.userId : memberEmail.trim().toLowerCase();
    const res = await TeamManagementService.upsertMember({
      userId: memberModalItem ? memberModalItem.userId : (await supabase.auth.getUser()).data.user?.id || "",
      email: memberEmail.trim(),
      fullName: memberFullName.trim(),
      phone: memberPhone.trim(),
      permissions: memberPermissions,
      isActive: memberIsActive,
    });
    setActionInProgress(null);
    if (!res.success) {
      Alert.alert("Save failed", res.message);
    } else {
      Alert.alert("Saved", "Team member profile and permissions updated.");
      setMemberModalItem(null);
      void loadTabContent();
    }
  };

  if (authLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center p-6" style={{ backgroundColor: royalAdmin.canvas }}>
        <View className="w-14 h-14 rounded-2xl items-center justify-center mb-4" style={{ backgroundColor: royalAdmin.blueSoft }}>
          <ActivityIndicator size="large" color={royalAdmin.navy} />
        </View>
        <Text className="text-foreground text-base font-bold">RoyalLagn Team Portal</Text>
        <Text className="text-muted-foreground mt-1 text-sm font-medium">Verifying team credentials…</Text>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 20 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="w-full max-w-md bg-card border border-border rounded-3xl p-6 sm:p-8 shadow-sm">
            {/* Header Badge */}
            <View className="items-center mb-6">
              <View className="w-14 h-14 rounded-2xl bg-primary/10 items-center justify-center mb-3">
                <ShieldCheck size={28} color={pink} />
              </View>
              <Text className="text-foreground text-2xl font-bold text-center">RoyalLagn Team Portal</Text>
              <Text className="text-muted-foreground text-xs text-center mt-1.5 leading-relaxed">
                Sign in with your team credentials to access assigned queues, verifications, and workflows.
              </Text>
            </View>

            {/* Error Message */}
            {signInError ? (
              <View className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex-row items-center gap-2.5">
                <AlertCircle size={18} color="#DC2626" />
                <Text className="text-red-600 dark:text-red-400 text-xs flex-1 font-medium leading-tight">
                  {signInError}
                </Text>
              </View>
            ) : null}

            {/* Form Fields */}
            <View className="gap-4">
              <View>
                <Text className="text-foreground text-xs font-semibold mb-1.5">Team Email</Text>
                <TextInput
                  value={signInEmail}
                  onChangeText={(val) => {
                    setSignInEmail(val);
                    setSignInError(null);
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="name@royallagn.com"
                  placeholderTextColor="#647B98"
                  className="w-full h-12 px-4 rounded-xl border border-border bg-background text-foreground text-sm font-medium"
                />
              </View>

              <View>
                <Text className="text-foreground text-xs font-semibold mb-1.5">Password</Text>
                <View className="relative justify-center">
                  <TextInput
                    value={signInPassword}
                    onChangeText={(val) => {
                      setSignInPassword(val);
                      setSignInError(null);
                    }}
                    secureTextEntry={!showPassword}
                    placeholder="••••••••"
                    placeholderTextColor="#647B98"
                    onSubmitEditing={() => void handleSignInSubmit()}
                    className="w-full h-12 pl-4 pr-11 rounded-xl border border-border bg-background text-foreground text-sm font-medium"
                  />
                  <Pressable
                    onPress={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 p-1"
                    accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff size={18} color="#8A8589" />
                    ) : (
                      <Eye size={18} color="#8A8589" />
                    )}
                  </Pressable>
                </View>
              </View>

              {/* Submit Button */}
              <Pressable
                onPress={() => void handleSignInSubmit()}
                disabled={signingIn}
                className={`mt-2 h-12 rounded-xl bg-primary items-center justify-center flex-row gap-2 active:opacity-90 ${
                  signingIn ? "opacity-70" : ""
                }`}
              >
                {signingIn ? (
                  <>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text className="text-white font-semibold text-sm">Signing in…</Text>
                  </>
                ) : (
                  <>
                    <Lock size={16} color="#FFFFFF" />
                    <Text className="text-white font-semibold text-sm">Sign In to Team Portal</Text>
                  </>
                )}
              </Pressable>
            </View>

            {/* Helper Notice */}
            <View className="mt-6 pt-5 border-t border-border items-center">
              <Text className="text-muted-foreground text-[11px] text-center leading-normal">
                Team memberships are provisioned by your system administrator. If you do not have credentials, please contact your manager.
              </Text>
              <Pressable
                onPress={() => router.replace("/(tabs)")}
                className="mt-4 px-4 py-2 rounded-xl bg-card border border-border hover:bg-muted active:opacity-80"
              >
                <Text className="text-primary text-xs font-semibold">Return to RoyalLagn Home</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!isTeamMember) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center px-6">
        <View className="w-16 h-16 rounded-2xl bg-red-500/10 items-center justify-center mb-4">
          <ShieldAlert size={36} color="#DC2626" />
        </View>
        <Text className="text-foreground text-xl font-bold text-center">Team Access Restricted</Text>
        <Text className="text-muted-foreground text-xs text-center mt-1">
          Signed in as <Text className="font-semibold text-foreground">{user?.email}</Text>
        </Text>
        <Text className="text-muted-foreground text-sm text-center mt-3 max-w-md leading-relaxed">
          This account does not have an active team staff membership. Please contact your RoyalLagn platform administrator to grant access to your account.
        </Text>
        <View className="flex-col sm:flex-row items-center gap-2.5 mt-6 w-full max-w-sm">
          <Pressable
            onPress={() => void signOut()}
            className="w-full sm:flex-1 py-2.5 rounded-xl bg-primary active:opacity-85 items-center"
          >
            <Text className="text-white font-semibold text-xs">Sign In with Different Account</Text>
          </Pressable>
          <Pressable
            onPress={() => router.replace("/(tabs)")}
            className="w-full sm:flex-1 py-2.5 rounded-xl bg-card border border-border active:opacity-85 items-center"
          >
            <Text className="text-foreground font-semibold text-xs">Return to Home</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // =========================================================================
  // QUEUE RENDER FUNCTIONS (Used in both full tabs and overview popups)
  // =========================================================================

  const renderSlaHealthPopup = () => (
    <View className="gap-4">
      {/* SLA Metrics Cards */}
      <View className="flex-row flex-wrap gap-2.5">
        <View className="flex-1 min-w-[130px] p-3.5 rounded-2xl bg-background border border-border">
          <View className="flex-row items-center justify-between mb-1.5">
            <Text className="text-muted-foreground text-[11px] font-semibold uppercase">Overdue</Text>
            <View className="w-6 h-6 rounded-lg bg-red-500/10 items-center justify-center">
              <Clock size={13} color="#DC2626" />
            </View>
          </View>
          <Text className="text-foreground text-2xl font-bold">{overview?.overdue_count ?? 0}</Text>
          <Text className="text-red-600 text-[10px] font-semibold mt-0.5">&gt; 24h SLA Breached</Text>
        </View>

        <View className="flex-1 min-w-[130px] p-3.5 rounded-2xl bg-background border border-border">
          <View className="flex-row items-center justify-between mb-1.5">
            <Text className="text-muted-foreground text-[11px] font-semibold uppercase">Escalated</Text>
            <View className="w-6 h-6 rounded-lg bg-amber-500/10 items-center justify-center">
              <AlertTriangle size={13} color="#D97706" />
            </View>
          </View>
          <Text className="text-foreground text-2xl font-bold">{overview?.escalated_count ?? 0}</Text>
          <Text className="text-amber-600 text-[10px] font-semibold mt-0.5">High Attention</Text>
        </View>

        <View className="flex-1 min-w-[130px] p-3.5 rounded-2xl bg-background border border-border">
          <View className="flex-row items-center justify-between mb-1.5">
            <Text className="text-muted-foreground text-[11px] font-semibold uppercase">Active Team</Text>
            <View className="w-6 h-6 rounded-lg bg-emerald-500/10 items-center justify-center">
              <Users size={13} color="#059669" />
            </View>
          </View>
          <Text className="text-foreground text-2xl font-bold">{overview?.active_members_count ?? 0}</Text>
          <Text className="text-emerald-600 text-[10px] font-semibold mt-0.5">Online Staff</Text>
        </View>
      </View>

      {/* Overdue Alert if count > 0 */}
      {(overview?.overdue_count || 0) > 0 ? (
        <View className="bg-red-500/10 border border-red-500/30 p-3.5 rounded-2xl flex-row items-center gap-3">
          <AlertTriangle size={20} color="#DC2626" />
          <View className="flex-1">
            <Text className="text-foreground font-bold text-xs">Critical: {overview?.overdue_count} Requests Exceeded 24h SLA</Text>
            <Text className="text-muted-foreground text-[11px] mt-0.5">
              Immediate action required. Please claim and process waiting verification or payout requests.
            </Text>
          </View>
        </View>
      ) : (
        <View className="bg-emerald-500/10 border border-emerald-500/30 p-3.5 rounded-2xl flex-row items-center gap-3">
          <CheckCircle2 size={20} color="#059669" />
          <View className="flex-1">
            <Text className="text-foreground font-bold text-xs">All Queues Operating Within SLA</Text>
            <Text className="text-muted-foreground text-[11px] mt-0.5">
              Great job! No requests are currently overdue or breaching turnaround times.
            </Text>
          </View>
        </View>
      )}

      {/* Queue SLA Breakdown & Jump Actions */}
      <View className="bg-card border border-border rounded-2xl p-4 gap-3">
        <Text className="text-foreground font-bold text-xs uppercase tracking-wider">Queue SLA Status & Actions</Text>

        {/* Item 1: Payment Verifications */}
        <View className="p-3 rounded-xl bg-background border border-border flex-row items-center justify-between">
          <View className="flex-row items-center gap-2.5 flex-1 min-w-0 pr-2">
            <View className="w-8 h-8 rounded-lg bg-emerald-500/10 items-center justify-center">
              <QrCode size={16} color="#059669" />
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-foreground text-xs font-bold" numberOfLines={1}>Payment Destination Verifications</Text>
              <Text className="text-muted-foreground text-[10px]">
                {overview?.destinations.pending ?? 0} pending · Target SLA: &lt; 2h · Limit: 24h
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => setOverviewPopup("verifications")}
            className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 active:opacity-80"
          >
            <Text className="text-emerald-700 text-[11px] font-bold">View Queue</Text>
          </Pressable>
        </View>

        {/* Item 2: Withdrawals */}
        <View className="p-3 rounded-xl bg-background border border-border flex-row items-center justify-between">
          <View className="flex-row items-center gap-2.5 flex-1 min-w-0 pr-2">
            <View className="w-8 h-8 rounded-lg bg-blue-500/10 items-center justify-center">
              <CircleDollarSign size={16} color="#2563EB" />
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-foreground text-xs font-bold" numberOfLines={1}>Referral Withdrawals & Payouts</Text>
              <Text className="text-muted-foreground text-[10px]">
                {overview?.withdrawals.pending ?? 0} pending ({money(overview?.withdrawals.pending_amount)}) · Target SLA: &lt; 6h · Limit: 24h
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => setOverviewPopup("withdrawals")}
            className="px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 active:opacity-80"
          >
            <Text className="text-blue-700 text-[11px] font-bold">View Queue</Text>
          </Pressable>
        </View>

        {/* Item 3: Vendor Applications */}
        <View className="p-3 rounded-xl bg-background border border-border flex-row items-center justify-between">
          <View className="flex-row items-center gap-2.5 flex-1 min-w-0 pr-2">
            <View className="w-8 h-8 rounded-lg bg-amber-500/10 items-center justify-center">
              <Building2 size={16} color="#D97706" />
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-foreground text-xs font-bold" numberOfLines={1}>Vendor Onboarding & Approvals</Text>
              <Text className="text-muted-foreground text-[10px]">
                {overview?.vendors.pending ?? 0} pending · Target SLA: &lt; 12h · Limit: 24h
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => setOverviewPopup("vendors")}
            className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 active:opacity-80"
          >
            <Text className="text-amber-700 text-[11px] font-bold">View Queue</Text>
          </Pressable>
        </View>
      </View>

      {/* SLA Policy Guidelines */}
      <View className="bg-background border border-border/80 rounded-2xl p-3.5">
        <Text className="text-foreground font-bold text-xs uppercase tracking-wider mb-2">Team SLA Policy Guidelines</Text>
        <View className="gap-2">
          <Text className="text-muted-foreground text-[11px] leading-relaxed">
            • <Text className="font-semibold text-foreground">SLA Breach Warning:</Text> Any queue task unresolved for &gt; 24 hours is automatically flagged as overdue and escalated to team supervisors.
          </Text>
          <Text className="text-muted-foreground text-[11px] leading-relaxed">
            • <Text className="font-semibold text-foreground">Escalation Protocol:</Text> Operators can escalate requests encountering payment disputes, fraudulent accounts, or unverified documents directly to Managers.
          </Text>
          <Text className="text-muted-foreground text-[11px] leading-relaxed">
            • <Text className="font-semibold text-foreground">High-Value Withdrawals:</Text> Payouts of ₹5,000 or more require two-operator sign-off before fund disbursement.
          </Text>
        </View>
      </View>
    </View>
  );

  const renderVerificationsQueue = () => (
    <View className="gap-4">
      {/* Filters bar */}
      <View className="bg-card border border-border p-3 rounded-2xl gap-3">
        <View className="flex-row items-center bg-background border border-border rounded-xl px-3 h-10">
          <Search size={16} className="text-muted-foreground" />
          <TextInput
            value={destSearch}
            onChangeText={setDestSearch}
            placeholder="Search by customer name, mobile, UPI ID..."
            placeholderTextColor="#647B98"
            className="flex-1 ml-2 text-foreground text-xs"
          />
        </View>

        {isMobile ? (
          <View className="flex-row items-center gap-2 pt-1 border-t border-border/50">
            {/* Status Dropdown Pill */}
            <Pressable
              onPress={() =>
                setFilterSheetConfig({
                  title: "Filter by Status",
                  subtitle: "Payment destination verification status",
                  options: [
                    { id: "pending", label: "Pending Review", count: overview?.destinations.pending },
                    { id: "approved", label: "Approved" },
                    { id: "changes_required", label: "Rejected / Changes Req" },
                    { id: "all", label: "All Statuses" },
                  ],
                  selectedId: destStatusFilter,
                  onSelect: (val) => setDestStatusFilter(val),
                })
              }
              className={`flex-1 py-2 px-2.5 rounded-xl border flex-row items-center justify-between ${
                destStatusFilter !== "pending" && destStatusFilter !== "all"
                  ? "bg-primary/10 border-primary"
                  : "bg-background border-border"
              }`}
            >
              <View className="flex-row items-center gap-1.5 flex-1 min-w-0 pr-1">
                <Filter size={12} color={destStatusFilter !== "pending" && destStatusFilter !== "all" ? pink : "#8A8589"} />
                <Text className="text-foreground text-xs font-semibold" numberOfLines={1}>
                  Status: {destStatusLabel}
                </Text>
              </View>
              <ChevronDown size={13} color={destStatusFilter !== "pending" && destStatusFilter !== "all" ? pink : "#8A8589"} />
            </Pressable>

            {/* Queue Dropdown Pill */}
            <Pressable
              onPress={() =>
                setFilterSheetConfig({
                  title: "Filter by Queue",
                  subtitle: "Task assignment & SLA urgency",
                  options: [
                    { id: "all", label: "All Queue Tasks" },
                    { id: "my_assigned", label: "My Assigned Tasks", count: overview?.destinations.my_assigned },
                    { id: "unassigned", label: "Unassigned Tasks", count: overview?.destinations.unassigned },
                    { id: "overdue", label: "Overdue Tasks (>24h)" },
                    { id: "escalated", label: "Escalated Tasks" },
                  ],
                  selectedId: destAssignmentFilter,
                  onSelect: (val) => setDestAssignmentFilter(val as QueueAssignmentFilter),
                })
              }
              className={`flex-1 py-2 px-2.5 rounded-xl border flex-row items-center justify-between ${
                destAssignmentFilter !== "all" ? "bg-primary/10 border-primary" : "bg-background border-border"
              }`}
            >
              <View className="flex-row items-center gap-1.5 flex-1 min-w-0 pr-1">
                <Users size={12} color={destAssignmentFilter !== "all" ? pink : "#8A8589"} />
                <Text className="text-foreground text-xs font-semibold" numberOfLines={1}>
                  Queue: {destAssignmentLabel}
                </Text>
              </View>
              <ChevronDown size={13} color={destAssignmentFilter !== "all" ? pink : "#8A8589"} />
            </Pressable>
          </View>
        ) : (
          <>
            {/* Status Filter */}
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="text-muted-foreground text-xs font-semibold">Status:</Text>
              {[
                { label: "Pending Review", value: "pending" },
                { label: "Approved", value: "approved" },
                { label: "Rejected / Changes Req", value: "changes_required" },
                { label: "All Statuses", value: "all" },
              ].map((s) => (
                <Pressable
                  key={s.value}
                  onPress={() => setDestStatusFilter(s.value)}
                  className={`min-h-8 px-2.5 rounded-lg border items-center justify-center ${
                    destStatusFilter === s.value ? "bg-primary border-primary" : "bg-card border-border hover:bg-muted"
                  }`}
                >
                  <Text className={`text-xs capitalize font-medium ${destStatusFilter === s.value ? "text-white font-bold" : "text-foreground"}`}>
                    {s.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Queue Assignment Filter */}
            <View className="flex-row flex-wrap items-center gap-2 pt-1 border-t border-border/50">
              <Text className="text-muted-foreground text-xs font-semibold">Queue:</Text>
              {(["all", "my_assigned", "unassigned", "overdue", "escalated"] as QueueAssignmentFilter[]).map((f) => (
                <Pressable
                  key={f}
                  onPress={() => setDestAssignmentFilter(f)}
                  className={`min-h-8 px-2.5 rounded-lg border items-center justify-center ${
                    destAssignmentFilter === f ? "bg-primary border-primary" : "bg-card border-border hover:bg-muted"
                  }`}
                >
                  <Text className={`text-xs capitalize font-medium ${destAssignmentFilter === f ? "text-white font-bold" : "text-foreground"}`}>
                    {f.replace("_", " ")}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator size="small" color={pink} className="py-8" />
      ) : destinations.length === 0 ? (
        <View className="bg-card border border-border py-6 px-5 rounded-2xl items-center">
          <QrCode size={36} className="text-muted-foreground opacity-40 mb-2" />
          <Text className="text-foreground font-semibold text-sm">No payment destinations found</Text>
          <Text className="text-muted-foreground text-xs mt-1 text-center">
            Try switching status filters (Pending, Approved, Rejected) or search for another customer.
          </Text>
        </View>
      ) : (
        <View className="gap-3">
          {destinations.map((item) => (
            <View key={item.id} className="bg-card border border-border p-4 rounded-2xl">
              <View className="flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <View className="flex-1 min-w-0">
                  <View className="flex-row items-center gap-2 flex-wrap">
                    <Text className="text-foreground font-bold text-base">{item.beneficiaryName}</Text>
                    <View className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                      <Text className="text-emerald-700 text-[10px] font-bold uppercase">v{item.version}</Text>
                    </View>
                    <View
                      className={`px-2 py-0.5 rounded-full border ${
                        item.status === "approved"
                          ? "bg-emerald-500/10 border-emerald-500/30"
                          : item.status === "changes_required"
                          ? "bg-red-500/10 border-red-500/30"
                          : "bg-amber-500/10 border-amber-500/30"
                      }`}
                    >
                      <Text
                        className={`text-[10px] font-bold uppercase ${
                          item.status === "approved"
                            ? "text-emerald-700"
                            : item.status === "changes_required"
                            ? "text-red-700"
                            : "text-amber-700"
                        }`}
                      >
                        {item.status === "approved"
                          ? "Approved ✓"
                          : item.status === "changes_required"
                          ? "Rejected"
                          : item.status}
                      </Text>
                    </View>
                    {item.isOverdue && (
                      <View className="px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20">
                        <Text className="text-red-600 text-[10px] font-bold">OVERDUE (&gt;24H)</Text>
                      </View>
                    )}
                    {item.escalated && (
                      <View className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                        <Text className="text-amber-700 text-[10px] font-bold">ESCALATED</Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-muted-foreground text-xs mt-0.5">
                    {item.customerProfile?.fullName || "Customer"} · {item.mobile || "No phone"} · UPI: <Text className="text-foreground font-mono">{item.upiId}</Text>
                  </Text>
                </View>

                {/* Assignment Badge */}
                <View className="self-start sm:self-auto sm:items-end">
                  {item.assignedTo === membership?.userId ? (
                    <View className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                      <Text className="text-emerald-700 text-xs font-bold">Assigned to You</Text>
                    </View>
                  ) : item.assignedTo ? (
                    <View className="px-2.5 py-1 rounded-lg bg-muted border border-border">
                      <Text className="text-muted-foreground text-xs font-medium">Claimed</Text>
                    </View>
                  ) : (
                    <View className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30">
                      <Text className="text-amber-700 text-xs font-bold">Unassigned</Text>
                    </View>
                  )}
                </View>
              </View>

              {item.observedRecipientName && (
                <View className="mt-2.5 p-2 rounded-xl bg-background border border-border flex-row items-center gap-2">
                  <CheckCircle2 size={14} color="#059669" />
                  <Text className="text-xs text-muted-foreground">
                    Observed in Banking App: <Text className="text-foreground font-semibold">{item.observedRecipientName}</Text>
                  </Text>
                </View>
              )}

              {item.rejectionReason && (
                <View className="mt-2.5 p-2 rounded-xl bg-red-500/10 border border-red-500/30">
                  <Text className="text-red-800 text-xs font-semibold">
                    Rejection Reason: {item.rejectionReason}
                  </Text>
                  {item.reviewNotes && (
                    <Text className="text-muted-foreground text-xs mt-0.5">Notes: {item.reviewNotes}</Text>
                  )}
                </View>
              )}

              {item.reviewNotes && !item.rejectionReason && (
                <View className="mt-2.5 p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <Text className="text-emerald-800 text-xs font-medium">
                    Verification Notes: {item.reviewNotes}
                  </Text>
                </View>
              )}

              {item.escalationReason && (
                <View className="mt-2.5 p-2 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <Text className="text-amber-800 text-xs font-medium">
                    Escalation Note: {item.escalationReason}
                  </Text>
                </View>
              )}

              {/* Actions Bar */}
              <View className="flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 mt-3.5 pt-3 border-t border-border">
                <Text className="text-muted-foreground text-[11px]">Submitted {new Date(item.createdAt).toLocaleString()}</Text>

                <View className="flex-row items-center flex-wrap gap-2 w-full sm:w-auto">
                  {(item.status === "approved" || item.status === "changes_required") && (canVerifyPayments || isAdmin) && (
                    <Pressable
                      onPress={() => {
                        setVerifyModalItem(item);
                        setObservedNameInput(item.observedRecipientName || item.beneficiaryName);
                        setVerifyNotesInput(item.reviewNotes || "");
                        setRejectionReasonInput(item.rejectionReason || "");
                      }}
                      className="px-3 py-1.5 rounded-xl bg-card border border-border active:opacity-80"
                    >
                      <Text className="text-primary text-xs font-bold">Re-evaluate</Text>
                    </Pressable>
                  )}

                  {!item.assignedTo && item.status !== "approved" && item.status !== "changes_required" && (
                    <Pressable
                      disabled={actionInProgress === item.id}
                      onPress={() => void handleClaim("payment_destination", item.id)}
                      className="px-3 py-1.5 rounded-xl bg-primary active:opacity-80"
                    >
                      <Text className="text-white text-xs font-bold">Claim Task</Text>
                    </Pressable>
                  )}

                  {item.assignedTo === membership?.userId && item.status !== "approved" && item.status !== "changes_required" && (
                    <>
                      <Pressable
                        disabled={actionInProgress === item.id}
                        onPress={() => void handleRelease("payment_destination", item.id)}
                        className="px-2.5 py-1.5 rounded-xl bg-card border border-border active:opacity-80"
                      >
                        <Text className="text-muted-foreground text-xs font-semibold">Release</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => {
                          setEscalateModalTarget({ queueType: "payment_destination", requestId: item.id });
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 active:opacity-80"
                      >
                        <Text className="text-amber-700 text-xs font-bold">Escalate</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => {
                          setVerifyModalItem(item);
                          setObservedNameInput(item.observedRecipientName || item.beneficiaryName);
                          setVerifyNotesInput(item.reviewNotes || "");
                          setRejectionReasonInput(item.rejectionReason || "");
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-primary active:opacity-80"
                      >
                        <Text className="text-white text-xs font-bold">Verify & Review</Text>
                      </Pressable>
                    </>
                  )}

                  {(isManager || isAdmin) && item.assignedTo && item.assignedTo !== membership?.userId && (
                    <Pressable
                      onPress={() => setReassignModalTarget({ queueType: "payment_destination", requestId: item.id })}
                      className="px-2.5 py-1.5 rounded-xl bg-card border border-border active:opacity-80"
                    >
                      <Text className="text-foreground text-xs font-semibold">Reassign</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const renderWithdrawalsQueue = () => (
    <View className="gap-4">
      {/* Filters */}
      <View className="bg-card border border-border p-3 rounded-2xl gap-3">
        <View className="flex-row items-center bg-background border border-border rounded-xl px-3 h-10">
          <Search size={16} className="text-muted-foreground" />
          <TextInput
            value={withSearch}
            onChangeText={setWithSearch}
            placeholder="Search by beneficiary, amount, UTR..."
            placeholderTextColor="#647B98"
            className="flex-1 ml-2 text-foreground text-xs"
          />
        </View>

        {isMobile ? (
          <View className="flex-row items-center gap-2 pt-1 border-t border-border/50">
            {/* Status Dropdown Pill */}
            <Pressable
              onPress={() =>
                setFilterSheetConfig({
                  title: "Filter by Status",
                  subtitle: "Withdrawal transaction payout status",
                  options: [
                    { id: "requested", label: "Requested" },
                    { id: "processing", label: "Processing" },
                    { id: "payment_pending", label: "Payment Pending" },
                    { id: "paid", label: "Paid / Completed" },
                    { id: "rejected", label: "Rejected" },
                    { id: "all", label: "All Statuses" },
                  ],
                  selectedId: withStatusFilter,
                  onSelect: (val) => setWithStatusFilter(val),
                })
              }
              className={`flex-1 py-2 px-2.5 rounded-xl border flex-row items-center justify-between ${
                withStatusFilter !== "requested" && withStatusFilter !== "all"
                  ? "bg-primary/10 border-primary"
                  : "bg-background border-border"
              }`}
            >
              <View className="flex-row items-center gap-1.5 flex-1 min-w-0 pr-1">
                <Filter size={12} color={withStatusFilter !== "requested" && withStatusFilter !== "all" ? pink : "#8A8589"} />
                <Text className="text-foreground text-xs font-semibold" numberOfLines={1}>
                  Status: {withStatusLabel}
                </Text>
              </View>
              <ChevronDown size={13} color={withStatusFilter !== "requested" && withStatusFilter !== "all" ? pink : "#8A8589"} />
            </Pressable>

            {/* Queue Dropdown Pill */}
            <Pressable
              onPress={() =>
                setFilterSheetConfig({
                  title: "Filter by Queue",
                  subtitle: "Assignment, approvals & SLA urgency",
                  options: [
                    { id: "my_assigned", label: "My Assigned Tasks" },
                    { id: "unassigned", label: "Unassigned Tasks" },
                    { id: "pending_second_approval", label: "2nd Approval Req (≥₹5,000)" },
                    { id: "overdue", label: "Overdue Tasks (>24h)" },
                    { id: "escalated", label: "Escalated Tasks" },
                    { id: "all", label: "All Withdrawals" },
                  ],
                  selectedId: withAssignmentFilter,
                  onSelect: (val) => setWithAssignmentFilter(val),
                })
              }
              className={`flex-1 py-2 px-2.5 rounded-xl border flex-row items-center justify-between ${
                withAssignmentFilter !== "all" ? "bg-primary/10 border-primary" : "bg-background border-border"
              }`}
            >
              <View className="flex-row items-center gap-1.5 flex-1 min-w-0 pr-1">
                <Users size={12} color={withAssignmentFilter !== "all" ? pink : "#8A8589"} />
                <Text className="text-foreground text-xs font-semibold" numberOfLines={1}>
                  Queue: {withAssignmentLabel}
                </Text>
              </View>
              <ChevronDown size={13} color={withAssignmentFilter !== "all" ? pink : "#8A8589"} />
            </Pressable>
          </View>
        ) : (
          <>
            {/* Queue Assignment Filter */}
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="text-muted-foreground text-xs font-semibold">Queue:</Text>
              {(["my_assigned", "unassigned", "pending_second_approval", "overdue", "escalated", "all"] as any[]).map((f) => (
                <Pressable
                  key={f}
                  onPress={() => setWithAssignmentFilter(f)}
                  className={`min-h-8 px-2.5 rounded-lg border items-center justify-center ${
                    withAssignmentFilter === f ? "bg-primary border-primary" : "bg-card border-border hover:bg-muted"
                  }`}
                >
                  <Text className={`text-xs capitalize font-medium ${withAssignmentFilter === f ? "text-white font-bold" : "text-foreground"}`}>
                    {f.replace(/_/g, " ")}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Status Filter */}
            <View className="flex-row flex-wrap items-center gap-2 pt-2 border-t border-border/50">
              <Text className="text-muted-foreground text-xs font-semibold">Status:</Text>
              {[
                { id: "requested", label: "Requested" },
                { id: "processing", label: "Processing" },
                { id: "payment_pending", label: "Payment Pending" },
                { id: "paid", label: "Paid / Completed" },
                { id: "rejected", label: "Rejected" },
                { id: "all", label: "All Statuses" },
              ].map((st) => (
                <Pressable
                  key={st.id}
                  onPress={() => setWithStatusFilter(st.id)}
                  className={`min-h-8 px-2.5 rounded-lg border items-center justify-center ${
                    withStatusFilter === st.id ? "bg-primary border-primary" : "bg-card border-border hover:bg-muted"
                  }`}
                >
                  <Text className={`text-xs capitalize font-medium ${withStatusFilter === st.id ? "text-white font-bold" : "text-foreground"}`}>
                    {st.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator size="small" color={pink} className="py-8" />
      ) : withdrawals.length === 0 ? (
        <View className="bg-card border border-border py-6 px-5 rounded-2xl items-center">
          <CircleDollarSign size={36} className="text-muted-foreground opacity-40 mb-2" />
          <Text className="text-foreground font-semibold text-sm">No withdrawal requests found</Text>
          <Text className="text-muted-foreground text-xs mt-1 text-center">No records matching the selected queue/status filters.</Text>
        </View>
      ) : (
        <View className="gap-3">
          {withdrawals.map((item) => (
            <View key={item.id} className="bg-card border border-border p-4 rounded-2xl">
              <View className="flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <View className="flex-1 min-w-0">
                  <View className="flex-row items-center gap-2 flex-wrap">
                    <Text className="text-foreground font-bold text-lg">{money(item.amount)}</Text>
                    <View className={`px-2 py-0.5 rounded-full border ${
                      item.status === "paid"
                        ? "bg-emerald-500/10 border-emerald-500/30"
                        : item.status === "processing"
                        ? "bg-blue-500/10 border-blue-500/30"
                        : item.status === "payment_pending"
                        ? "bg-amber-500/10 border-amber-500/30"
                        : item.status === "rejected" || item.status === "cancelled"
                        ? "bg-red-500/10 border-red-500/30"
                        : "bg-purple-500/10 border-purple-500/30"
                    }`}>
                      <Text className={`text-[10px] font-bold uppercase ${
                        item.status === "paid"
                          ? "text-emerald-700 dark:text-emerald-400"
                          : item.status === "processing"
                          ? "text-blue-700 dark:text-blue-400"
                          : item.status === "payment_pending"
                          ? "text-amber-700 dark:text-amber-400"
                          : item.status === "rejected" || item.status === "cancelled"
                          ? "text-red-700 dark:text-red-400"
                          : "text-purple-700 dark:text-purple-400"
                      }`}>
                        {item.status === "paid" ? "Paid ✓" : item.status.replace(/_/g, " ")}
                      </Text>
                    </View>
                    {item.secondApprovalRequired && (
                      <View className={`px-2 py-0.5 rounded-full border ${
                        item.secondApprovedBy ? "bg-emerald-500/10 border-emerald-500/20" : "bg-amber-500/10 border-amber-500/20"
                      }`}>
                        <Text className={`text-[10px] font-bold ${item.secondApprovedBy ? "text-emerald-700" : "text-amber-700"}`}>
                          {item.secondApprovedBy ? "2ND APPROVED ✓" : "NEEDS 2ND APPROVAL"}
                        </Text>
                      </View>
                    )}
                    {item.isOverdue && (
                      <View className="px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20">
                        <Text className="text-red-600 text-[10px] font-bold">OVERDUE (&gt;24H)</Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-muted-foreground text-xs mt-1">
                    Beneficiary: <Text className="text-foreground font-semibold">{item.beneficiaryName}</Text> · UPI:{" "}
                    <Text className="text-foreground font-mono">{item.destinationSnapshot?.upi_id || item.mobile}</Text>
                  </Text>
                  {item.destinationSnapshot?.observed_recipient_name && (
                    <Text className="text-muted-foreground text-xs mt-0.5">
                      Verified Recipient: <Text className="text-emerald-700 font-semibold">{item.destinationSnapshot.observed_recipient_name}</Text>
                    </Text>
                  )}
                </View>

                {/* Assignment Badge */}
                <View className="self-start sm:self-auto sm:items-end">
                  {item.assignedTo === membership?.userId ? (
                    <View className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                      <Text className="text-emerald-700 text-xs font-bold">Assigned to You</Text>
                    </View>
                  ) : item.assignedTo ? (
                    <View className="px-2.5 py-1 rounded-lg bg-muted border border-border">
                      <Text className="text-muted-foreground text-xs font-medium">Claimed</Text>
                    </View>
                  ) : (
                    <View className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30">
                      <Text className="text-amber-700 text-xs font-bold">Unassigned</Text>
                    </View>
                  )}
                </View>
              </View>

              {item.transactionRef && (
                <View className="mt-2.5 p-2 rounded-xl bg-background border border-border flex-row items-center gap-2">
                  <ReceiptText size={14} color="#059669" />
                  <Text className="text-xs text-muted-foreground">
                    UTR Reference: <Text className="text-foreground font-mono font-bold">{item.transactionRef}</Text> · Account: {item.businessSourceAccount}
                  </Text>
                </View>
              )}

              {/* Actions */}
              <View className="flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 mt-3.5 pt-3 border-t border-border">
                <Text className="text-muted-foreground text-[11px]">Requested {new Date(item.requestedAt).toLocaleString()}</Text>

                <View className="flex-row items-center flex-wrap gap-2 w-full sm:w-auto">
                  {(item.status === "paid" || item.status === "processing" || item.status === "payment_pending") && (canHandleFinance || isAdmin) && (
                    <Pressable
                      onPress={() => {
                        setPayoutExecItem(item);
                        setPayoutStatusTab(
                          item.status === "paid"
                            ? "paid"
                            : item.status === "payment_pending"
                            ? "payment_pending"
                            : "processing"
                        );
                        setUtrInput(item.transactionRef || "");
                        setSourceAccountInput(item.businessSourceAccount || "RoyalLagn Business Account");
                        setPayoutNotesInput(item.reconciliationNotes || "");
                      }}
                      className="px-3 py-1.5 rounded-xl bg-card border border-border active:opacity-80"
                    >
                      <Text className="text-primary text-xs font-bold">
                        {item.status === "paid" ? "View / Edit Payout" : "Update Status"}
                      </Text>
                    </Pressable>
                  )}

                  {!item.assignedTo && item.status !== "paid" && item.status !== "rejected" && (
                    <Pressable
                      disabled={actionInProgress === item.id}
                      onPress={() => void handleClaim("withdrawal", item.id)}
                      className="px-3 py-1.5 rounded-xl bg-primary active:opacity-80"
                    >
                      <Text className="text-white text-xs font-bold">Claim Task</Text>
                    </Pressable>
                  )}

                  {item.assignedTo === membership?.userId && item.status !== "paid" && item.status !== "rejected" && (
                    <>
                      <Pressable
                        disabled={actionInProgress === item.id}
                        onPress={() => void handleRelease("withdrawal", item.id)}
                        className="px-2.5 py-1.5 rounded-xl bg-card border border-border active:opacity-80"
                      >
                        <Text className="text-muted-foreground text-xs font-semibold">Release</Text>
                      </Pressable>

                      {/* 2nd approval action if needed */}
                      {item.secondApprovalRequired && !item.secondApprovedBy && (isManager || isAdmin) && (
                        <Pressable
                          onPress={() => setSecondApproveItem(item)}
                          className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 active:opacity-80"
                        >
                          <Text className="text-amber-700 text-xs font-bold">2nd Approval</Text>
                        </Pressable>
                      )}

                      {/* Payout execution action */}
                      <Pressable
                        disabled={item.secondApprovalRequired && !item.secondApprovedBy}
                        onPress={() => {
                          setPayoutExecItem(item);
                          setPayoutStatusTab(
                            item.status === "paid"
                              ? "paid"
                              : item.status === "payment_pending"
                              ? "payment_pending"
                              : "processing"
                          );
                          setUtrInput(item.transactionRef || "");
                          setSourceAccountInput(item.businessSourceAccount || "RoyalLagn Business Account");
                          setPayoutNotesInput(item.reconciliationNotes || "");
                        }}
                        className={`px-3.5 py-1.5 rounded-xl ${
                          item.secondApprovalRequired && !item.secondApprovedBy
                            ? "bg-muted opacity-50"
                            : "bg-emerald-600 active:opacity-80"
                        }`}
                      >
                        <Text className="text-white text-xs font-bold">Execute Payout</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const renderVendorsQueue = () => (
    <View className="gap-4">
      <View className="bg-card border border-border p-3 rounded-2xl gap-3">
        <View className="flex-row items-center bg-background border border-border rounded-xl px-3 h-10">
          <Search size={16} className="text-muted-foreground" />
          <TextInput
            value={vendorSearch}
            onChangeText={setVendorSearch}
            placeholder="Search business name, owner, city..."
            placeholderTextColor="#647B98"
            className="flex-1 ml-2 text-foreground text-xs"
          />
        </View>

        {isMobile ? (
          <View className="flex-row items-center gap-2 pt-1 border-t border-border/50">
            {/* Status Dropdown Pill */}
            <Pressable
              onPress={() =>
                setFilterSheetConfig({
                  title: "Filter by Status",
                  subtitle: "Vendor onboarding application status",
                  options: [
                    { id: "pending", label: "Pending Review", count: overview?.vendors.pending },
                    { id: "approved", label: "Approved" },
                    { id: "rejected", label: "Rejected" },
                    { id: "all", label: "All Statuses" },
                  ],
                  selectedId: vendorStatusFilter,
                  onSelect: (val) => setVendorStatusFilter(val),
                })
              }
              className={`flex-1 py-2 px-2.5 rounded-xl border flex-row items-center justify-between ${
                vendorStatusFilter !== "pending" && vendorStatusFilter !== "all"
                  ? "bg-primary/10 border-primary"
                  : "bg-background border-border"
              }`}
            >
              <View className="flex-row items-center gap-1.5 flex-1 min-w-0 pr-1">
                <Filter size={12} color={vendorStatusFilter !== "pending" && vendorStatusFilter !== "all" ? pink : "#8A8589"} />
                <Text className="text-foreground text-xs font-semibold" numberOfLines={1}>
                  Status: {vendorStatusLabel}
                </Text>
              </View>
              <ChevronDown size={13} color={vendorStatusFilter !== "pending" && vendorStatusFilter !== "all" ? pink : "#8A8589"} />
            </Pressable>

            {/* Queue Dropdown Pill */}
            <Pressable
              onPress={() =>
                setFilterSheetConfig({
                  title: "Filter by Queue",
                  subtitle: "Vendor reviewer assignment",
                  options: [
                    { id: "all", label: "All Applications" },
                    { id: "my_assigned", label: "My Assigned Tasks", count: overview?.vendors.my_assigned },
                    { id: "unassigned", label: "Unassigned Tasks", count: overview?.vendors.unassigned },
                  ],
                  selectedId: vendorAssignmentFilter,
                  onSelect: (val) => setVendorAssignmentFilter(val as QueueAssignmentFilter),
                })
              }
              className={`flex-1 py-2 px-2.5 rounded-xl border flex-row items-center justify-between ${
                vendorAssignmentFilter !== "all" ? "bg-primary/10 border-primary" : "bg-background border-border"
              }`}
            >
              <View className="flex-row items-center gap-1.5 flex-1 min-w-0 pr-1">
                <Users size={12} color={vendorAssignmentFilter !== "all" ? pink : "#8A8589"} />
                <Text className="text-foreground text-xs font-semibold" numberOfLines={1}>
                  Queue: {vendorAssignmentLabel}
                </Text>
              </View>
              <ChevronDown size={13} color={vendorAssignmentFilter !== "all" ? pink : "#8A8589"} />
            </Pressable>
          </View>
        ) : (
          <>
            {/* Queue Assignment Filter */}
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="text-muted-foreground text-xs font-semibold">Queue:</Text>
              {(["my_assigned", "unassigned", "all"] as any[]).map((f) => (
                <Pressable
                  key={f}
                  onPress={() => setVendorAssignmentFilter(f)}
                  className={`min-h-8 px-2.5 rounded-lg border items-center justify-center ${
                    vendorAssignmentFilter === f ? "bg-primary border-primary" : "bg-card border-border hover:bg-muted"
                  }`}
                >
                  <Text className={`text-xs capitalize font-medium ${vendorAssignmentFilter === f ? "text-white font-bold" : "text-foreground"}`}>
                    {f.replace(/_/g, " ")}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Status Filter */}
            <View className="flex-row flex-wrap items-center gap-2 pt-2 border-t border-border/50">
              <Text className="text-muted-foreground text-xs font-semibold">Status:</Text>
              {[
                { id: "pending", label: "Pending Review" },
                { id: "approved", label: "Approved" },
                { id: "rejected", label: "Rejected" },
                { id: "all", label: "All Statuses" },
              ].map((st) => (
                <Pressable
                  key={st.id}
                  onPress={() => setVendorStatusFilter(st.id)}
                  className={`min-h-8 px-2.5 rounded-lg border items-center justify-center ${
                    vendorStatusFilter === st.id ? "bg-primary border-primary" : "bg-card border-border hover:bg-muted"
                  }`}
                >
                  <Text className={`text-xs font-medium ${vendorStatusFilter === st.id ? "text-white font-bold" : "text-foreground"}`}>
                    {st.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={pink} className="py-8" />
      ) : vendorApps.length === 0 ? (
        <View className="bg-card border border-border py-6 px-5 rounded-2xl items-center">
          <Building2 size={36} className="text-muted-foreground opacity-40 mb-2" />
          <Text className="text-foreground font-semibold text-sm">No vendor applications found</Text>
          <Text className="text-muted-foreground text-xs mt-1 text-center">No records matching the selected queue/status filters.</Text>
        </View>
      ) : (
        <View className="gap-3">
          {vendorApps.map((item) => (
            <View key={item.id} className="bg-card border border-border p-4 rounded-2xl">
              <View className="flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <View className="flex-1 min-w-0">
                  <View className="flex-row items-center gap-2 mb-1 flex-wrap">
                    <Text className="text-foreground font-bold text-base">{item.businessName}</Text>
                    <View className={`px-2 py-0.5 rounded-full border ${
                      item.status === "approved"
                        ? "bg-emerald-500/10 border-emerald-500/30"
                        : item.status === "rejected"
                        ? "bg-red-500/10 border-red-500/30"
                        : "bg-amber-500/10 border-amber-500/30"
                    }`}>
                      <Text className={`text-[10px] font-bold uppercase ${
                        item.status === "approved"
                          ? "text-emerald-700 dark:text-emerald-400"
                          : item.status === "rejected"
                          ? "text-red-700 dark:text-red-400"
                          : "text-amber-700 dark:text-amber-400"
                      }`}>
                        {item.status === "approved" ? "Approved ✓" : item.status}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-muted-foreground text-xs mt-0.5">
                    {item.fullName} · {item.categoryName} · {item.city}, {item.state}
                  </Text>
                  <Text className="text-muted-foreground text-xs mt-0.5">
                    Experience: {item.experience} years · Phone: {item.phone}
                  </Text>
                  {item.verifierRecommendation && (
                    <View className="mt-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <Text className="text-amber-800 text-xs font-semibold capitalize">
                        Verifier Recommendation: {item.verifierRecommendation.replace(/_/g, " ")}
                      </Text>
                      {item.verifierNotes && <Text className="text-muted-foreground text-xs mt-0.5">{item.verifierNotes}</Text>}
                    </View>
                  )}
                </View>

                <View className="self-start sm:self-auto sm:items-end">
                  {item.assignedTo === membership?.userId ? (
                    <View className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                      <Text className="text-emerald-700 text-xs font-bold">Assigned to You</Text>
                    </View>
                  ) : item.assignedTo ? (
                    <View className="px-2.5 py-1 rounded-lg bg-muted border border-border">
                      <Text className="text-muted-foreground text-xs font-medium">Claimed</Text>
                    </View>
                  ) : (
                    <View className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30">
                      <Text className="text-amber-700 text-xs font-bold">Unassigned</Text>
                    </View>
                  )}
                </View>
              </View>

              <View className="flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 mt-3.5 pt-3 border-t border-border">
                <Text className="text-muted-foreground text-[11px]">Submitted {new Date(item.submittedAt).toLocaleDateString()}</Text>

                <View className="flex-row items-center flex-wrap gap-2 w-full sm:w-auto">
                  {(item.status === "approved" || item.status === "rejected") && (canVerifyVendors || isAdmin) && (
                    <Pressable
                      onPress={() => setVendorModalItem(item)}
                      className="px-3 py-1.5 rounded-xl bg-card border border-border active:opacity-80"
                    >
                      <Text className="text-primary text-xs font-bold">Re-evaluate</Text>
                    </Pressable>
                  )}

                  {!item.assignedTo && item.status === "pending" && (
                    <Pressable
                      onPress={() => void handleClaim("vendor_application", item.id)}
                      className="px-3 py-1.5 rounded-xl bg-primary active:opacity-80"
                    >
                      <Text className="text-white text-xs font-bold">Claim Task</Text>
                    </Pressable>
                  )}

                  {item.assignedTo === membership?.userId && item.status === "pending" && (
                    <Pressable
                      onPress={() => setVendorModalItem(item)}
                      className="px-3.5 py-1.5 rounded-xl bg-primary active:opacity-80"
                    >
                      <Text className="text-white text-xs font-bold">Review & Recommend</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[{ flex: 1, width: "100%", backgroundColor: royalAdmin.canvas }, royalAdminThemeVars]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 64 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadTabContent(); }} tintColor={royalAdmin.navy} />}
      >
        <ResponsiveContainer style={{ maxWidth: 1600, alignSelf: "center", width: "100%" }}>
          <AdminPageHeader
            title="Team Portal"
            subtitle={membership?.fullName ? `${currentTabConfig?.label || "Overview"} · ${membership.fullName}` : (currentTabConfig?.label || "Shared operational queues")}
            action={
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Pressable
                  onPress={() => setSidebarOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Open team sections"
                  style={styles.headerButton}
                >
                  <Menu size={18} color={royalAdmin.navy} />
                  {totalPendingBadges > 0 ? <View style={styles.headerDot} /> : null}
                </Pressable>
                {isAdmin ? (
                  <Pressable
                    onPress={() => router.push("/admin-dashboard")}
                    accessibilityRole="button"
                    accessibilityLabel="Open admin console"
                    style={styles.headerButtonWide}
                  >
                    <Building2 size={16} color={royalAdmin.navy} />
                    {isSmall ? null : <Text style={styles.headerButtonText}>Admin</Text>}
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => void loadTabContent()}
                  accessibilityLabel="Refresh queue"
                  style={styles.headerButton}
                >
                  <RefreshCw size={18} color={royalAdmin.navy} />
                </Pressable>
                <Pressable
                  onPress={() => {
                    Alert.alert("Sign Out", "Are you sure you want to sign out of the Team Portal?", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Sign Out", style: "destructive", onPress: () => void signOut() },
                    ]);
                  }}
                  accessibilityLabel="Sign out"
                  style={styles.headerButton}
                >
                  <LogOut size={18} color={royalAdmin.rose} />
                </Pressable>
              </View>
            }
          />
        {/* ========================================================================= */}
        {/* TAB 1: OVERVIEW                                                           */}
        {/* ========================================================================= */}
        {activeTab === "overview" && (
          <View className="gap-5">
            {/* KPI Cards Grid - 2 in a row on mobile */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: isMobile ? 8 : 12 }}>
              {(canVerifyPayments || isAdmin) && (
                <Pressable
                  onPress={() => setOverviewPopup("verifications")}
                  style={isMobile ? { width: mobileKpiCardWidth } : { flexGrow: 1, flexBasis: 240, minWidth: 220, maxWidth: 320 }}
                  className="bg-card border border-border p-3 sm:p-4 rounded-2xl shadow-sm hover:border-primary/40 active:opacity-80"
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-muted-foreground text-[10px] sm:text-xs font-semibold uppercase tracking-wider flex-1 min-w-0 pr-1" numberOfLines={1}>
                      {isMobile ? "Verifications" : "Payment Verifications"}
                    </Text>
                    <View className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-500/10 items-center justify-center">
                      <QrCode size={15} color="#059669" />
                    </View>
                  </View>
                  <Text className="text-foreground text-xl sm:text-2xl font-bold mt-1.5 sm:mt-2">{overview?.destinations.pending ?? 0}</Text>
                  <Text className="text-muted-foreground text-[10px] sm:text-xs mt-1" numberOfLines={1} ellipsizeMode="tail">
                    {isMobile
                      ? `${overview?.destinations.my_assigned ?? 0} mine · ${overview?.destinations.unassigned ?? 0} open`
                      : `${overview?.destinations.my_assigned ?? 0} assigned to you · ${overview?.destinations.unassigned ?? 0} unassigned`}
                  </Text>
                </Pressable>
              )}

              {(canHandleFinance || isAdmin) && (
                <Pressable
                  onPress={() => setOverviewPopup("withdrawals")}
                  style={isMobile ? { width: mobileKpiCardWidth } : { flexGrow: 1, flexBasis: 240, minWidth: 220, maxWidth: 320 }}
                  className="bg-card border border-border p-3 sm:p-4 rounded-2xl shadow-sm hover:border-primary/40 active:opacity-80"
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-muted-foreground text-[10px] sm:text-xs font-semibold uppercase tracking-wider flex-1 min-w-0 pr-1" numberOfLines={1}>
                      {isMobile ? "Withdrawals" : "Pending Withdrawals"}
                    </Text>
                    <View className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-500/10 items-center justify-center">
                      <CircleDollarSign size={15} color="#2563EB" />
                    </View>
                  </View>
                  <Text className="text-foreground text-xl sm:text-2xl font-bold mt-1.5 sm:mt-2" numberOfLines={1}>
                    {money(overview?.withdrawals.pending_amount)}
                  </Text>
                  <Text className="text-muted-foreground text-[10px] sm:text-xs mt-1" numberOfLines={1} ellipsizeMode="tail">
                    {isMobile
                      ? `${overview?.withdrawals.pending ?? 0} req · ${overview?.withdrawals.pending_second_approval ?? 0} 2nd`
                      : `${overview?.withdrawals.pending ?? 0} requests · ${overview?.withdrawals.pending_second_approval ?? 0} pending 2nd approval`}
                  </Text>
                </Pressable>
              )}

              {(canVerifyVendors || isAdmin) && (
                <Pressable
                  onPress={() => setOverviewPopup("vendors")}
                  style={isMobile ? { width: mobileKpiCardWidth } : { flexGrow: 1, flexBasis: 240, minWidth: 220, maxWidth: 320 }}
                  className="bg-card border border-border p-3 sm:p-4 rounded-2xl shadow-sm hover:border-primary/40 active:opacity-80"
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-muted-foreground text-[10px] sm:text-xs font-semibold uppercase tracking-wider flex-1 min-w-0 pr-1" numberOfLines={1}>
                      {isMobile ? "Vendors" : "Vendor Applications"}
                    </Text>
                    <View className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-500/10 items-center justify-center">
                      <Building2 size={15} color="#D97706" />
                    </View>
                  </View>
                  <Text className="text-foreground text-xl sm:text-2xl font-bold mt-1.5 sm:mt-2">{overview?.vendors.pending ?? 0}</Text>
                  <Text className="text-muted-foreground text-[10px] sm:text-xs mt-1" numberOfLines={1} ellipsizeMode="tail">
                    {isMobile
                      ? `${overview?.vendors.my_assigned ?? 0} mine · ${overview?.vendors.unassigned ?? 0} open`
                      : `${overview?.vendors.my_assigned ?? 0} assigned to you · ${overview?.vendors.unassigned ?? 0} unassigned`}
                  </Text>
                </Pressable>
              )}

              <Pressable
                onPress={() => setOverviewPopup("sla")}
                style={isMobile ? { width: mobileKpiCardWidth } : { flexGrow: 1, flexBasis: 240, minWidth: 220, maxWidth: 320 }}
                className="bg-card border border-border p-3 sm:p-4 rounded-2xl shadow-sm hover:border-primary/40 active:opacity-80"
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-muted-foreground text-[10px] sm:text-xs font-semibold uppercase tracking-wider flex-1 min-w-0 pr-1" numberOfLines={1}>
                    SLA & Health
                  </Text>
                  <View className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-red-500/10 items-center justify-center">
                    <Clock size={15} color="#DC2626" />
                  </View>
                </View>
                <View className="flex-row items-baseline gap-1.5 mt-1.5 sm:mt-2">
                  <Text className="text-foreground text-xl sm:text-2xl font-bold">{overview?.overdue_count ?? 0}</Text>
                  <Text className="text-red-600 text-[10px] sm:text-xs font-semibold">Overdue</Text>
                </View>
                <Text className="text-muted-foreground text-[10px] sm:text-xs mt-1" numberOfLines={1} ellipsizeMode="tail">
                  {isMobile
                    ? `${overview?.escalated_count ?? 0} esc · ${overview?.active_members_count ?? 0} staff`
                    : `${overview?.escalated_count ?? 0} escalated items · ${overview?.active_members_count ?? 0} active team members`}
                </Text>
              </Pressable>
            </View>

            {/* Overdue / Escalations Alert Banner */}
            {(overview?.overdue_count || 0) > 0 && (
              <View className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl flex-row items-center gap-3">
                <AlertTriangle size={24} color="#D97706" />
                <View className="flex-1">
                  <Text className="text-foreground font-bold text-sm">Action Required: {overview?.overdue_count} Requests Exceeded 24h SLA</Text>
                  <Text className="text-muted-foreground text-xs mt-0.5">
                    Requests waiting more than 24 hours require prompt review or reassignment to keep customer turnaround within promised SLA.
                  </Text>
                </View>
              </View>
            )}

            {/* Recent Activity Stream */}
            <View className="bg-card border border-border rounded-2xl p-4">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-foreground font-bold text-sm">Recent Team Activity</Text>
                <Pressable onPress={() => setActiveTab("activity")}>
                  <Text className="text-primary text-xs font-semibold">View All Logs →</Text>
                </Pressable>
              </View>

              {activityLogs.length === 0 ? (
                <Text className="text-muted-foreground text-xs py-4 text-center">No recent activity recorded.</Text>
              ) : (
                <View className="gap-2.5">
                  {activityLogs.slice(0, 5).map((log) => (
                    <View key={log.id} className="p-3 rounded-xl bg-background border border-border/60 flex-row items-center justify-between">
                      <View className="flex-row items-center gap-2.5">
                        <View className="w-7 h-7 rounded-lg bg-primary/10 items-center justify-center">
                          <CheckCircle2 size={14} color={pink} />
                        </View>
                        <View>
                          <Text className="text-foreground text-xs font-bold">
                            {log.actorName} · <Text className="capitalize text-muted-foreground">{log.action.replace("_", " ")}</Text>
                          </Text>
                          <Text className="text-muted-foreground text-[11px] mt-0.5 capitalize">
                            {log.entityType.replace("_", " ")}
                          </Text>
                        </View>
                      </View>
                      <Text className="text-muted-foreground text-[10px]">{new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: PAYMENT VERIFICATIONS                                              */}
        {/* ========================================================================= */}
        {activeTab === "verifications" && (canVerifyPayments || isAdmin) && renderVerificationsQueue()}

        {/* ========================================================================= */}
        {/* TAB 3: WITHDRAWALS & PAYOUTS                                              */}
        {/* ========================================================================= */}
        {activeTab === "withdrawals" && (canHandleFinance || isAdmin) && renderWithdrawalsQueue()}

        {/* ========================================================================= */}
        {/* TAB 4: VENDOR APPROVALS                                                   */}
        {/* ========================================================================= */}
        {activeTab === "vendors" && (canVerifyVendors || isAdmin) && renderVendorsQueue()}

        {/* ========================================================================= */}
        {/* TAB 5: WORKSPACES & CAMPAIGNS                                             */}
        {/* ========================================================================= */}
        {activeTab === "workspaces" && (
          <View className="gap-4">
            <View className="bg-primary/10 border border-primary/20 p-4 rounded-2xl flex-row items-center gap-3">
              <Tag size={24} color={pink} />
              <View className="flex-1">
                <Text className="text-foreground font-bold text-sm">Marketing Campaigns & Workspaces</Text>
                <Text className="text-muted-foreground text-xs mt-0.5">
                  Track vendor acquisition pipelines, contact stages, and campaign meetings. (Public workspace sharing and lead forms are scheduled for Phase 3).
                </Text>
              </View>
            </View>

            {workspaces.length === 0 ? (
              <View className="bg-card border border-border py-6 px-5 rounded-2xl items-center">
                <Tag size={36} className="text-muted-foreground opacity-40 mb-2" />
                <Text className="text-foreground font-semibold text-sm">No active marketing workspaces</Text>
                <Text className="text-muted-foreground text-xs mt-1 text-center">Admin creates workspaces from the CRM module.</Text>
              </View>
            ) : (
              <View className="gap-3">
                {workspaces.map((ws) => (
                  <View key={ws.id} className="bg-card border border-border p-4 rounded-2xl">
                    <View className="flex-row items-center justify-between gap-2 flex-wrap">
                      <Text className="text-foreground font-bold text-base">{ws.name}</Text>
                      <View className="px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20">
                        <Text className="text-primary text-xs font-bold uppercase">{ws.status}</Text>
                      </View>
                    </View>
                    <Text className="text-muted-foreground text-xs mt-1">Team: {ws.team_name} · Priority: {ws.priority}</Text>
                    {ws.description ? <Text className="text-foreground text-xs mt-2 leading-4">{ws.description}</Text> : null}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ========================================================================= */}
        {/* TAB 6: ACTIVITY & AUDIT LOG                                               */}
        {/* ========================================================================= */}
        {activeTab === "activity" && (
          <View className="bg-card border border-border rounded-2xl p-4 gap-3">
            <Text className="text-foreground font-bold text-sm mb-1">Operational Audit Trail</Text>
            {activityLogs.length === 0 ? (
              <Text className="text-muted-foreground text-xs py-4 text-center">No logs found.</Text>
            ) : (
              activityLogs.map((log) => (
                <View key={log.id} className="p-3.5 rounded-xl bg-background border border-border flex-col sm:flex-row sm:items-start sm:justify-between gap-1.5 sm:gap-3">
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2 flex-wrap">
                      <Text className="text-foreground font-bold text-xs">{log.actorName}</Text>
                      <View className="px-2 py-0.5 rounded-md bg-muted">
                        <Text className="text-muted-foreground text-[10px] font-mono capitalize">{log.action.replace(/_/g, " ")}</Text>
                      </View>
                    </View>
                    <Text className="text-muted-foreground text-xs mt-1">
                      Entity: <Text className="capitalize font-medium">{log.entityType.replace(/_/g, " ")}</Text> ({log.entityId.slice(0, 8)}…)
                    </Text>
                    {log.details && Object.keys(log.details).length > 0 && (
                      <Text className="text-muted-foreground font-mono text-[11px] mt-1 bg-card/60 p-1.5 rounded-md">
                        {JSON.stringify(log.details)}
                      </Text>
                    )}
                  </View>
                  <Text className="text-muted-foreground text-[10px] sm:text-[11px]">{new Date(log.createdAt).toLocaleString()}</Text>
                </View>
              ))
            )}
          </View>
        )}

        {/* ========================================================================= */}
        {/* TAB 7: TEAM MANAGEMENT (Manager / Admin)                                  */}
        {/* ========================================================================= */}
        {activeTab === "team" && (isManager || isAdmin) && (
          <View className="gap-4">
            <View className="flex-row items-center justify-between gap-2 flex-wrap">
              <Text className="text-foreground font-bold text-base">Authorized Team Members</Text>
              {isAdmin && (
                <Pressable
                  onPress={() => {
                    setMemberModalItem(null);
                    setMemberEmail("");
                    setMemberFullName("");
                    setMemberPhone("");
                    setMemberPermissions(["payment_verifier"]);
                    setMemberIsActive(true);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-primary flex-row items-center gap-1.5 active:opacity-80"
                >
                  <UserPlus size={15} color="#FFF" />
                  <Text className="text-white text-xs font-bold">Invite Member</Text>
                </Pressable>
              )}
            </View>

            <View className="gap-3">
              {teamMembers.map((member) => (
                <View key={member.id} className="bg-card border border-border p-4 rounded-2xl">
                  <View className="flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <View className="flex-1 min-w-0">
                      <View className="flex-row items-center gap-2 flex-wrap">
                        <Text className="text-foreground font-bold text-base">{member.fullName}</Text>
                        <View className={`px-2 py-0.5 rounded-full ${member.isActive ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                          <Text className={`text-[10px] font-bold ${member.isActive ? "text-emerald-700" : "text-red-600"}`}>
                            {member.isActive ? "ACTIVE" : "SUSPENDED"}
                          </Text>
                        </View>
                      </View>
                      <Text className="text-muted-foreground text-xs mt-0.5">{member.email} · {member.phone || "No phone"}</Text>
                    </View>

                    {isAdmin && (
                      <Pressable
                        onPress={() => {
                          setMemberModalItem(member);
                          setMemberEmail(member.email);
                          setMemberFullName(member.fullName);
                          setMemberPhone(member.phone || "");
                          setMemberPermissions(member.permissions);
                          setMemberIsActive(member.isActive);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-card border border-border active:opacity-80 self-start sm:self-auto"
                      >
                        <Text className="text-primary text-xs font-bold">Edit Permissions</Text>
                      </Pressable>
                    )}
                  </View>

                  {/* Permissions Badges */}
                  <View className="flex-row flex-wrap gap-1.5 mt-3 pt-3 border-t border-border">
                    {member.permissions.map((perm) => (
                      <View key={perm} className="px-2.5 py-1 rounded-lg bg-background border border-border">
                        <Text className="text-foreground text-[11px] font-semibold">{TEAM_PERMISSION_LABELS[perm]?.title || perm}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
        </ResponsiveContainer>
      </ScrollView>

      {/* ========================================================================= */}
      {/* SIDEBAR DRAWER (Top-Left Navigation: All 7 Tabs & Staff Profile)          */}
      {/* ========================================================================= */}
      <Modal
        visible={sidebarOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSidebarOpen(false)}
      >
        <View className="flex-1 flex-row bg-black/60">
          {/* Drawer Container (Slides out from Left) */}
          <View
            className="bg-card border-r border-border h-full flex-col justify-between"
            style={{
              width: Math.min(320, Math.floor(width * 0.85)),
              maxWidth: 340,
            }}
          >
            {/* Drawer Header */}
            <View className="p-4 sm:p-5 border-b border-border bg-card/80">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2.5">
                  <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center">
                    <ShieldCheck size={20} color={pink} />
                  </View>
                  <View>
                    <Text className="text-foreground text-base font-bold">RoyalLagn</Text>
                    <Text className="text-muted-foreground text-[11px] font-semibold">Team Portal Navigation</Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => setSidebarOpen(false)}
                  className="w-8 h-8 rounded-full bg-muted items-center justify-center active:opacity-80"
                  accessibilityLabel="Close sidebar"
                >
                  <X size={16} className="text-muted-foreground" />
                </Pressable>
              </View>

              {/* Staff Profile Card inside Sidebar */}
              <View className="mt-3.5 p-2.5 rounded-xl bg-background border border-border">
                <View className="flex-row items-center gap-2">
                  <View className="w-7 h-7 rounded-lg bg-primary/15 items-center justify-center">
                    <User size={14} color={pink} />
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="text-foreground text-xs font-bold" numberOfLines={1}>
                      {membership?.fullName || "Staff Member"}
                    </Text>
                    <Text className="text-muted-foreground text-[10px]" numberOfLines={1}>
                      {membership?.email || (isAdmin ? "Admin / Owner" : isManager ? "Team Manager" : "Operator")}
                    </Text>
                  </View>
                </View>
                {membership?.permissions && membership.permissions.length > 0 && (
                  <View className="flex-row flex-wrap gap-1 mt-2 pt-2 border-t border-border/50">
                    {membership.permissions.map((p) => (
                      <View key={p} className="px-1.5 py-0.5 rounded-md bg-muted/60">
                        <Text className="text-muted-foreground text-[9px] font-medium">
                          {TEAM_PERMISSION_LABELS[p]?.title || p}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>

            {/* Drawer Scrollable Navigation Links (All 7 Tabs) */}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 12, gap: 4 }}
              showsVerticalScrollIndicator={false}
            >
              <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider px-2 py-1.5">
                Queues & Workspaces
              </Text>

              {tabsList.map((tab) => {
                const IconComp = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <Pressable
                    key={tab.id}
                    onPress={() => {
                      setActiveTab(tab.id);
                      setSidebarOpen(false);
                    }}
                    className={`flex-row items-center justify-between p-3 rounded-xl active:opacity-80 ${
                      isActive
                        ? "bg-primary text-white shadow-sm"
                        : "bg-transparent text-foreground hover:bg-muted"
                    }`}
                  >
                    <View className="flex-row items-center gap-3 flex-1 min-w-0">
                      <View
                        className={`w-8 h-8 rounded-lg items-center justify-center ${
                          isActive ? "bg-white/20" : "bg-muted"
                        }`}
                      >
                        <IconComp size={16} color={isActive ? "#FFFFFF" : "#8A8589"} />
                      </View>
                      <Text
                        numberOfLines={1}
                        className={`text-sm ${
                          isActive ? "text-white font-bold" : "text-foreground font-semibold"
                        }`}
                      >
                        {tab.label}
                      </Text>
                    </View>

                    {tab.badge != null && tab.badge > 0 && (
                      <View
                        className={`px-2 py-0.5 rounded-full ${
                          isActive ? "bg-white/20" : tab.badgeColor || "bg-primary"
                        }`}
                      >
                        <Text
                          className={`text-xs font-black ${
                            isActive ? "text-white" : "text-white"
                          }`}
                        >
                          {tab.badge > 99 ? "99+" : tab.badge}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Drawer Footer Actions */}
            <View className="p-3.5 border-t border-border bg-card/80 gap-2">
              {isAdmin && (
                <Pressable
                  onPress={() => {
                    setSidebarOpen(false);
                    router.push("/admin-dashboard");
                  }}
                  className="p-2.5 rounded-xl bg-background border border-border flex-row items-center gap-2 active:opacity-80"
                >
                  <Building2 size={15} color={pink} />
                  <Text className="text-foreground text-xs font-bold flex-1">Admin Console</Text>
                  <ChevronRight size={14} className="text-muted-foreground" />
                </Pressable>
              )}

              <Pressable
                onPress={() => {
                  setSidebarOpen(false);
                  Alert.alert("Sign Out", "Are you sure you want to sign out of the Team Portal?", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Sign Out", style: "destructive", onPress: () => void signOut() },
                  ]);
                }}
                className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 flex-row items-center gap-2 active:opacity-80"
              >
                <LogOut size={15} color="#DC2626" />
                <Text className="text-red-600 text-xs font-bold flex-1">Sign Out</Text>
              </Pressable>
            </View>
          </View>

          {/* Right Backdrop (Tapping closes the sidebar) */}
          <Pressable
            style={{ flex: 1 }}
            onPress={() => setSidebarOpen(false)}
            accessibilityLabel="Close sidebar backdrop"
          />
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* QUICK FILTER BOTTOM SHEET (Mobile status & queue selector)                 */}
      {/* ========================================================================= */}
      <Modal
        visible={Boolean(filterSheetConfig)}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterSheetConfig(null)}
      >
        <View className="flex-1 bg-black/60 justify-end">
          {/* Dismiss backdrop on press */}
          <Pressable
            style={{ flex: 1 }}
            onPress={() => setFilterSheetConfig(null)}
            accessibilityLabel="Close filter"
          />

          <View className="bg-card border-t border-border rounded-t-3xl p-5 pb-8 max-w-lg w-full self-center">
            {/* Header */}
            <View className="flex-row items-center justify-between pb-3.5 border-b border-border">
              <View className="flex-row items-center gap-2.5">
                <View className="w-8 h-8 rounded-lg bg-primary/10 items-center justify-center">
                  <Filter size={16} color={pink} />
                </View>
                <View>
                  <Text className="text-foreground text-base font-bold">
                    {filterSheetConfig?.title || "Filter"}
                  </Text>
                  {filterSheetConfig?.subtitle && (
                    <Text className="text-muted-foreground text-xs">{filterSheetConfig.subtitle}</Text>
                  )}
                </View>
              </View>

              <Pressable
                onPress={() => setFilterSheetConfig(null)}
                className="w-8 h-8 rounded-full bg-muted items-center justify-center active:opacity-80"
              >
                <X size={16} className="text-muted-foreground" />
              </Pressable>
            </View>

            {/* Options List */}
            <View className="gap-2 mt-4">
              {filterSheetConfig?.options.map((opt) => {
                const isSelected = filterSheetConfig.selectedId === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => {
                      filterSheetConfig.onSelect(opt.id);
                      setFilterSheetConfig(null);
                    }}
                    className={`flex-row items-center justify-between p-3.5 rounded-2xl border active:opacity-80 ${
                      isSelected
                        ? "bg-primary/10 border-primary"
                        : "bg-background border-border hover:bg-muted"
                    }`}
                  >
                    <View className="flex-row items-center gap-2.5 flex-1 min-w-0">
                      <View
                        className={`w-5 h-5 rounded-full border items-center justify-center ${
                          isSelected ? "border-primary bg-primary" : "border-muted-foreground/40 bg-transparent"
                        }`}
                      >
                        {isSelected && <Check size={12} color="#FFF" strokeWidth={3} />}
                      </View>
                      <Text
                        className={`text-sm ${
                          isSelected ? "text-primary font-bold" : "text-foreground font-medium"
                        }`}
                        numberOfLines={1}
                      >
                        {opt.label}
                      </Text>
                    </View>

                    {opt.count != null && (
                      <View className="px-2 py-0.5 rounded-full bg-muted">
                        <Text className="text-muted-foreground text-xs font-semibold">{opt.count}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 0: OVERVIEW POPUP (Verifications, Withdrawals, Vendors, SLA & Health) */}
      {/* ========================================================================= */}
      <Modal visible={Boolean(overviewPopup)} transparent animationType="slide" onRequestClose={() => setOverviewPopup(null)}>
        <View className="flex-1 bg-black/70 justify-end sm:justify-center p-0 sm:p-4">
          <View
            className="bg-card border border-border rounded-t-3xl sm:rounded-3xl w-full max-w-3xl flex-1 sm:flex-initial"
            style={{
              maxHeight: isMobile ? "94%" : "90%",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Modal Sticky Header */}
            <View className="px-4 py-3 border-b border-border flex-row items-center justify-between shrink-0 bg-card rounded-t-3xl">
              <View className="flex-row items-center gap-2.5 flex-1 min-w-0 pr-2">
                {overviewPopup === "verifications" && (
                  <>
                    <View className="w-8 h-8 rounded-lg bg-emerald-500/10 items-center justify-center">
                      <QrCode size={18} color="#059669" />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-foreground text-base font-bold" numberOfLines={1}>Payment Verifications</Text>
                      <Text className="text-muted-foreground text-xs">{overview?.destinations.pending ?? 0} pending review</Text>
                    </View>
                  </>
                )}

                {overviewPopup === "withdrawals" && (
                  <>
                    <View className="w-8 h-8 rounded-lg bg-blue-500/10 items-center justify-center">
                      <CircleDollarSign size={18} color="#2563EB" />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-foreground text-base font-bold" numberOfLines={1}>Withdrawals & Payouts</Text>
                      <Text className="text-muted-foreground text-xs">{money(overview?.withdrawals.pending_amount)} pending</Text>
                    </View>
                  </>
                )}

                {overviewPopup === "vendors" && (
                  <>
                    <View className="w-8 h-8 rounded-lg bg-amber-500/10 items-center justify-center">
                      <Building2 size={18} color="#D97706" />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-foreground text-base font-bold" numberOfLines={1}>Vendor Applications</Text>
                      <Text className="text-muted-foreground text-xs">{overview?.vendors.pending ?? 0} pending review</Text>
                    </View>
                  </>
                )}

                {overviewPopup === "sla" && (
                  <>
                    <View className="w-8 h-8 rounded-lg bg-red-500/10 items-center justify-center">
                      <Clock size={18} color="#DC2626" />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-foreground text-base font-bold" numberOfLines={1}>SLA & Health Overview</Text>
                      <Text className="text-muted-foreground text-xs">Turnaround & Performance Monitor</Text>
                    </View>
                  </>
                )}
              </View>

              <View className="flex-row items-center gap-2">
                {overviewPopup && overviewPopup !== "sla" && (
                  <Pressable
                    onPress={() => {
                      const target = overviewPopup;
                      setOverviewPopup(null);
                      if (target) setActiveTab(target as PortalTab);
                    }}
                    className="min-h-8 px-3 rounded-xl bg-primary/10 items-center justify-center active:opacity-80"
                  >
                    <Text className="text-primary text-button font-semibold">Open Full Tab →</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => setOverviewPopup(null)}
                  className="w-8 h-8 rounded-full bg-muted items-center justify-center active:opacity-80"
                >
                  <X size={16} className="text-muted-foreground" />
                </Pressable>
              </View>
            </View>

            {/* Modal Scrollable Body */}
            <ScrollView
              style={{ flex: 1, minHeight: 0 }}
              contentContainerStyle={{ padding: isMobile ? 12 : 16, paddingBottom: 32 }}
              showsVerticalScrollIndicator={true}
            >
              {overviewPopup === "verifications" && renderVerificationsQueue()}
              {overviewPopup === "withdrawals" && renderWithdrawalsQueue()}
              {overviewPopup === "vendors" && renderVendorsQueue()}
              {overviewPopup === "sla" && renderSlaHealthPopup()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 1: PAYMENT VERIFICATION REVIEW                                      */}
      {/* ========================================================================= */}
      <Modal visible={Boolean(verifyModalItem)} transparent animationType="fade" onRequestClose={() => setVerifyModalItem(null)}>
        <View className="flex-1 bg-black/70 items-center justify-center p-3 sm:p-4">
          <View
            className="bg-card border border-border rounded-2xl sm:rounded-3xl w-full"
            style={{
              maxHeight: isMobile ? "94%" : "88%",
              maxWidth: 520,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Sticky Header */}
            <View className="flex-row items-center justify-between p-4 sm:p-5 pb-3 border-b border-border shrink-0">
              <View className="flex-1 pr-2">
                <Text className="text-foreground text-base sm:text-lg font-bold">Verify Customer Payment Details</Text>
                <Text className="text-muted-foreground text-xs">Review beneficiary details against banking app</Text>
              </View>
              <Pressable onPress={() => setVerifyModalItem(null)} className="p-1.5 rounded-xl bg-muted active:opacity-70">
                <X size={18} className="text-muted-foreground" />
              </Pressable>
            </View>

            {/* Scrollable Body */}
            <ScrollView
              style={{ flex: 1, minHeight: 0 }}
              contentContainerStyle={{ paddingHorizontal: isMobile ? 14 : 20, paddingVertical: 14 }}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              {/* Customer Details Card */}
              <View className="bg-background border border-border p-3.5 rounded-2xl gap-1.5 mb-4">
                <Text className="text-muted-foreground text-xs font-semibold uppercase">Submitted Details</Text>
                <Text className="text-foreground font-bold text-base">{verifyModalItem?.beneficiaryName}</Text>
                <Text className="text-muted-foreground text-xs">Mobile: {verifyModalItem?.mobile}</Text>
                <Text className="text-muted-foreground text-xs">UPI ID: <Text className="font-mono text-foreground font-semibold">{verifyModalItem?.upiId}</Text></Text>

                {verifyModalItem?.qrCodeUrl && (
                  <Pressable
                    onPress={() => setQrModalUrl(verifyModalItem.qrCodeUrl || null)}
                    className="mt-2 py-2 px-3 bg-card border border-border rounded-xl flex-row items-center justify-center gap-2 active:opacity-80"
                  >
                    <QrCode size={16} color={pink} />
                    <Text className="text-primary text-xs font-bold">Inspect QR Code Image</Text>
                  </Pressable>
                )}
              </View>

              {/* Verification Checklist */}
              <Text className="text-foreground font-bold text-xs uppercase tracking-wider mb-2">Verification Checklist</Text>

              <Pressable
                onPress={() => setNameMatchesCheck(!nameMatchesCheck)}
                className="flex-row items-center gap-3 p-3 rounded-xl bg-background border border-border mb-2"
              >
                <View className={`w-5 h-5 rounded-md border items-center justify-center ${nameMatchesCheck ? "bg-emerald-600 border-emerald-600" : "border-border"}`}>
                  {nameMatchesCheck && <CheckCircle2 size={14} color="#FFF" />}
                </View>
                <Text className="text-foreground text-xs font-medium flex-1">
                  Beneficiary name matches the registered recipient name in banking app / UPI
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setMobileMatchesCheck(!mobileMatchesCheck)}
                className="flex-row items-center gap-3 p-3 rounded-xl bg-background border border-border mb-4"
              >
                <View className={`w-5 h-5 rounded-md border items-center justify-center ${mobileMatchesCheck ? "bg-emerald-600 border-emerald-600" : "border-border"}`}>
                  {mobileMatchesCheck && <CheckCircle2 size={14} color="#FFF" />}
                </View>
                <Text className="text-foreground text-xs font-medium flex-1">
                  Mobile number / UPI handle ownership verified against customer identity
                </Text>
              </Pressable>

              {/* Observed Name Input */}
              <Text className="text-foreground font-bold text-xs uppercase tracking-wider mb-1">
                Observed Recipient Name <Text className="text-red-500">*</Text>
              </Text>
              <TextInput
                value={observedNameInput}
                onChangeText={setObservedNameInput}
                placeholder="Exact name shown in PhonePe / GPay / Paytm"
                placeholderTextColor="#647B98"
                className="bg-background border border-border rounded-xl px-3 py-2.5 text-foreground text-xs mb-3"
              />

              {/* Review Notes */}
              <Text className="text-foreground font-bold text-xs uppercase tracking-wider mb-1">Internal Notes</Text>
              <TextInput
                value={verifyNotesInput}
                onChangeText={setVerifyNotesInput}
                placeholder="Optional notes for audit log"
                placeholderTextColor="#647B98"
                className="bg-background border border-border rounded-xl px-3 py-2.5 text-foreground text-xs mb-3"
              />

              {/* Rejection / Correction Reason */}
              <Text className="text-foreground font-bold text-xs uppercase tracking-wider mb-1">
                Rejection / Correction Reason (If Rejecting)
              </Text>
              <TextInput
                value={rejectionReasonInput}
                onChangeText={setRejectionReasonInput}
                placeholder="Explain mismatch so customer can correct (e.g. name does not match)"
                placeholderTextColor="#647B98"
                className="bg-background border border-border rounded-xl px-3 py-2.5 text-foreground text-xs"
              />
            </ScrollView>

            {/* Sticky Footer */}
            <View className="flex-col sm:flex-row items-center gap-2 sm:gap-2.5 p-4 sm:p-5 pt-3 border-t border-border shrink-0 bg-card">
              <Pressable
                disabled={Boolean(actionInProgress)}
                onPress={() => void handleVerifySubmit("changes_required")}
                className="w-full sm:flex-1 py-3 rounded-xl bg-red-500/10 border border-red-500/30 items-center active:opacity-80"
              >
                <Text className="text-red-600 font-bold text-xs">Request Corrections</Text>
              </Pressable>

              <Pressable
                disabled={Boolean(actionInProgress)}
                onPress={() => void handleVerifySubmit("approved")}
                className="w-full sm:flex-1 py-3 rounded-xl bg-emerald-600 items-center active:opacity-80"
              >
                <Text className="text-white font-bold text-xs">Approve Verification</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 2: SAFE QR CODE VIEWER                                              */}
      {/* ========================================================================= */}
      <Modal visible={Boolean(qrModalUrl)} transparent animationType="fade" onRequestClose={() => setQrModalUrl(null)}>
        <View className="flex-1 bg-black/80 items-center justify-center p-4">
          <View className="bg-card border border-border rounded-2xl sm:rounded-3xl p-5 w-full max-w-sm items-center">
            <Text className="text-foreground font-bold text-base mb-3">Customer Payment QR</Text>
            {qrModalUrl && (
              <Image source={{ uri: qrModalUrl }} className="w-64 h-64 rounded-2xl bg-white mb-4" resizeMode="contain" />
            )}
            <Pressable
              onPress={() => setQrModalUrl(null)}
              className="w-full py-2.5 rounded-xl bg-primary items-center"
            >
              <Text className="text-white font-bold text-xs">Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 3: WITHDRAWAL 2ND APPROVAL                                          */}
      {/* ========================================================================= */}
      <Modal visible={Boolean(secondApproveItem)} transparent animationType="fade" onRequestClose={() => setSecondApproveItem(null)}>
        <View className="flex-1 bg-black/70 items-center justify-center p-3 sm:p-4">
          <View
            className="bg-card border border-border rounded-2xl sm:rounded-3xl w-full"
            style={{
              maxHeight: isMobile ? "94%" : "88%",
              maxWidth: 480,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <View className="p-4 sm:p-5 pb-3 border-b border-border shrink-0">
              <Text className="text-foreground text-base sm:text-lg font-bold">Second Approval: High-Value Withdrawal</Text>
              <Text className="text-muted-foreground text-xs mt-0.5">
                Withdrawals of ₹5,000 or more require manager or second finance operator approval.
              </Text>
            </View>

            <ScrollView
              style={{ flex: 1, minHeight: 0 }}
              contentContainerStyle={{ paddingHorizontal: isMobile ? 14 : 20, paddingVertical: 14 }}
              showsVerticalScrollIndicator={true}
            >
              <View className="bg-background border border-border p-3.5 rounded-2xl mb-3">
                <Text className="text-muted-foreground text-xs">Amount</Text>
                <Text className="text-foreground font-bold text-xl">{money(secondApproveItem?.amount)}</Text>
                <Text className="text-muted-foreground text-xs mt-1">Beneficiary: {secondApproveItem?.beneficiaryName}</Text>
              </View>

              <Text className="text-foreground font-bold text-xs uppercase tracking-wider mb-1">Approval Notes</Text>
              <TextInput
                value={secondApproveNotes}
                onChangeText={setSecondApproveNotes}
                placeholder="e.g. Verified customer transaction history"
                placeholderTextColor="#647B98"
                className="bg-background border border-border rounded-xl px-3 py-2.5 text-foreground text-xs"
              />
            </ScrollView>

            <View className="flex-row items-center gap-2 p-4 sm:p-5 pt-3 border-t border-border shrink-0 bg-card">
              <Pressable
                onPress={() => setSecondApproveItem(null)}
                className="flex-1 py-2.5 rounded-xl bg-background border border-border items-center"
              >
                <Text className="text-muted-foreground font-bold text-xs">Cancel</Text>
              </Pressable>
              <Pressable
                disabled={Boolean(actionInProgress)}
                onPress={() => void handleSecondApproveSubmit()}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 items-center"
              >
                <Text className="text-white font-bold text-xs">Authorize Payout</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 4: PAYOUT EXECUTION & STATUS SELECTOR (Prefetched Details + 3 Tabs) */}
      {/* ========================================================================= */}
      <Modal visible={Boolean(payoutExecItem)} transparent animationType="fade" onRequestClose={() => setPayoutExecItem(null)}>
        <View className="flex-1 bg-black/70 items-center justify-center p-3 sm:p-4">
          <View
            className="bg-card border border-border rounded-2xl sm:rounded-3xl w-full"
            style={{
              maxHeight: isMobile ? "94%" : "88%",
              maxWidth: 520,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* STICKY HEADER */}
            <View className="flex-row items-center justify-between p-4 sm:p-5 pb-3 border-b border-border shrink-0">
              <View className="flex-1 pr-3 min-w-0">
                <Text className="text-foreground text-base sm:text-lg font-bold" numberOfLines={1}>Execute Manual Payout</Text>
                <Text className="text-muted-foreground text-xs" numberOfLines={1}>
                  Prefetched payment destination & status controller
                </Text>
              </View>
              <Pressable onPress={() => setPayoutExecItem(null)} className="p-1.5 rounded-xl bg-muted active:opacity-70 shrink-0">
                <X size={18} className="text-muted-foreground" />
              </Pressable>
            </View>

            {/* Copy Notification Toast */}
            {copyToast && (
              <View className="mx-4 sm:mx-5 my-2 p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex-row items-center justify-center gap-1.5 shrink-0">
                <CheckCircle2 size={13} color="#059669" />
                <Text className="text-emerald-700 dark:text-emerald-400 text-xs font-bold">{copyToast}</Text>
              </View>
            )}

            {/* SCROLLABLE BODY */}
            <ScrollView
              style={{ flex: 1, minHeight: 0 }}
              contentContainerStyle={{ paddingHorizontal: isMobile ? 14 : 20, paddingVertical: 14 }}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              {/* PREFETCHED PAYMENT DESTINATION CARD */}
              <View className="bg-background border border-border p-4 rounded-2xl mb-4 gap-3">
                {/* Transfer Amount & Recipient */}
                <View className="flex-col sm:flex-row sm:items-start sm:justify-between border-b border-border pb-3 gap-2">
                  <View>
                    <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">Transfer Amount</Text>
                    <Text className="text-foreground font-black text-2xl tracking-tight">{money(payoutExecItem?.amount)}</Text>
                  </View>
                  <View className="sm:items-end max-w-full sm:max-w-[55%]">
                    <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider sm:text-right">Beneficiary Name</Text>
                    <Text className="text-foreground font-bold text-sm sm:text-right" numberOfLines={1}>
                      {payoutExecItem?.destinationSnapshot?.beneficiary_name || payoutExecItem?.beneficiaryName}
                    </Text>
                    {payoutExecItem?.destinationSnapshot?.observed_recipient_name ? (
                      <View className="flex-row items-center gap-1 mt-0.5 sm:justify-end">
                        <CheckCircle2 size={10} color="#059669" />
                        <Text className="text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold" numberOfLines={1}>
                          Verified: {payoutExecItem.destinationSnapshot.observed_recipient_name}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                {/* Prefetched Attributes: UPI ID & GPay Phone Number */}
                <View className="gap-2">
                  {/* 1. Receiving UPI ID */}
                  <View className="flex-row items-center justify-between bg-card border border-border px-3 py-2.5 rounded-xl">
                    <View className="flex-1 mr-2">
                      <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">Receiving UPI ID</Text>
                      <Text className="text-foreground font-mono text-xs font-bold select-all" numberOfLines={1}>
                        {payoutExecItem?.destinationSnapshot?.upi_id || payoutExecItem?.mobile || "Not specified"}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleCopyText(payoutExecItem?.destinationSnapshot?.upi_id || payoutExecItem?.mobile || "", "UPI ID")}
                      className="px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/20 flex-row items-center gap-1 active:opacity-70"
                    >
                      <Copy size={12} color={royalAdmin.navy} />
                      <Text className="text-primary text-[11px] font-bold">Copy</Text>
                    </Pressable>
                  </View>

                  {/* 2. GPay / Phone Number */}
                  <View className="flex-row items-center justify-between bg-card border border-border px-3 py-2.5 rounded-xl">
                    <View className="flex-1 mr-2">
                      <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">GPay / Phone Number</Text>
                      <Text className="text-foreground font-mono text-xs font-bold select-all" numberOfLines={1}>
                        {payoutExecItem?.destinationSnapshot?.mobile || payoutExecItem?.mobile || payoutExecItem?.customerProfile?.phone || "No phone linked"}
                      </Text>
                    </View>
                    {(payoutExecItem?.destinationSnapshot?.mobile || payoutExecItem?.mobile || payoutExecItem?.customerProfile?.phone) ? (
                      <Pressable
                        onPress={() => handleCopyText(payoutExecItem?.destinationSnapshot?.mobile || payoutExecItem?.mobile || payoutExecItem?.customerProfile?.phone || "", "Phone Number")}
                        className="px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/20 flex-row items-center gap-1 active:opacity-70"
                      >
                        <Copy size={12} color={royalAdmin.navy} />
                        <Text className="text-primary text-[11px] font-bold">Copy</Text>
                      </Pressable>
                    ) : null}
                  </View>

                  {/* 3. Personal Receiving QR Code */}
                  {payoutExecItem?.destinationSnapshot?.qr_code_url ? (
                    <View className="bg-card border border-border p-3 rounded-xl items-center">
                      <View className="flex-row items-center justify-between w-full mb-2">
                        <View className="flex-row items-center gap-1.5">
                          <QrCode size={14} color={royalAdmin.navy} />
                          <Text className="text-foreground text-xs font-bold">Personal Receiving QR Code</Text>
                        </View>
                        <Pressable
                          onPress={() => {
                            if (Platform.OS === "web" && typeof window !== "undefined") {
                              window.open(payoutExecItem.destinationSnapshot?.qr_code_url || "", "_blank");
                            }
                          }}
                          className="flex-row items-center gap-1 px-2 py-0.5 rounded bg-muted active:opacity-70"
                        >
                          <ExternalLink size={10} className="text-muted-foreground" />
                          <Text className="text-muted-foreground text-[10px] font-medium">Open Full</Text>
                        </Pressable>
                      </View>
                      <View className="p-2 bg-white rounded-xl border border-border/50 shadow-sm">
                        <Image
                          source={{ uri: payoutExecItem.destinationSnapshot.qr_code_url }}
                          style={{ width: 140, height: 140 }}
                          resizeMode="contain"
                        />
                      </View>
                      <Text className="text-muted-foreground text-[10px] mt-1.5 font-medium">
                        Scan directly with GPay / PhonePe / Paytm to execute payment
                      </Text>
                    </View>
                  ) : (
                    <View className="bg-card border border-dashed border-border px-3 py-2 rounded-xl flex-row items-center gap-2">
                      <QrCode size={14} className="text-muted-foreground" />
                      <Text className="text-muted-foreground text-[11px]">No QR code image uploaded with destination.</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* THREE STATUS SELECTOR TABS */}
              <View className="mb-4">
                <Text className="text-foreground font-bold text-xs uppercase tracking-wider mb-2">
                  Select Payout Status
                </Text>
                <View className="flex-row bg-background border border-border p-1 rounded-2xl gap-1">
                  {/* Tab 1: Processing */}
                  <Pressable
                    onPress={() => setPayoutStatusTab("processing")}
                    style={{
                      backgroundColor: payoutStatusTab === "processing" ? "#2563EB" : "rgba(37, 99, 235, 0.08)",
                      borderWidth: 1,
                      borderColor: payoutStatusTab === "processing" ? "#2563EB" : "rgba(37, 99, 235, 0.25)",
                    }}
                    className="flex-1 py-2 sm:py-2.5 px-1.5 sm:px-2 rounded-xl items-center justify-center flex-row gap-1 sm:gap-1.5 active:opacity-80"
                  >
                    <Clock size={12} color={payoutStatusTab === "processing" ? "#FFFFFF" : "#2563EB"} />
                    <Text
                      style={{
                        color: payoutStatusTab === "processing" ? "#FFFFFF" : "#2563EB",
                        fontWeight: "700",
                        fontSize: 11,
                      }}
                      numberOfLines={1}
                    >
                      Processing
                    </Text>
                  </Pressable>

                  {/* Tab 2: Payment Pending */}
                  <Pressable
                    onPress={() => setPayoutStatusTab("payment_pending")}
                    style={{
                      backgroundColor: payoutStatusTab === "payment_pending" ? "#D97706" : "rgba(217, 119, 6, 0.08)",
                      borderWidth: 1,
                      borderColor: payoutStatusTab === "payment_pending" ? "#D97706" : "rgba(217, 119, 6, 0.25)",
                    }}
                    className="flex-1 py-2 sm:py-2.5 px-1.5 sm:px-2 rounded-xl items-center justify-center flex-row gap-1 sm:gap-1.5 active:opacity-80"
                  >
                    <AlertCircle size={12} color={payoutStatusTab === "payment_pending" ? "#FFFFFF" : "#D97706"} />
                    <Text
                      style={{
                        color: payoutStatusTab === "payment_pending" ? "#FFFFFF" : "#D97706",
                        fontWeight: "700",
                        fontSize: 11,
                      }}
                      numberOfLines={1}
                    >
                      Pending
                    </Text>
                  </Pressable>

                  {/* Tab 3: Payment Successful */}
                  <Pressable
                    onPress={() => setPayoutStatusTab("paid")}
                    style={{
                      backgroundColor: payoutStatusTab === "paid" ? "#059669" : "rgba(5, 150, 105, 0.08)",
                      borderWidth: 1,
                      borderColor: payoutStatusTab === "paid" ? "#059669" : "rgba(5, 150, 105, 0.25)",
                    }}
                    className="flex-1 py-2 sm:py-2.5 px-1.5 sm:px-2 rounded-xl items-center justify-center flex-row gap-1 sm:gap-1.5 active:opacity-80"
                  >
                    <CheckCircle2 size={12} color={payoutStatusTab === "paid" ? "#FFFFFF" : "#059669"} />
                    <Text
                      style={{
                        color: payoutStatusTab === "paid" ? "#FFFFFF" : "#059669",
                        fontWeight: "700",
                        fontSize: 11,
                      }}
                      numberOfLines={1}
                    >
                      Successful
                    </Text>
                  </Pressable>
                </View>

                {/* Status Explanation Helper */}
                <Text className="text-muted-foreground text-[11px] mt-2 px-1">
                  {payoutStatusTab === "paid"
                    ? "✓ Completes request, records UTR reference, and deducts the amount from customer's referral balance."
                    : payoutStatusTab === "processing"
                    ? "ℹ Sets status to Processing. Funds remain held in customer's reserved balance."
                    : "ℹ Sets status to Payment Pending (awaiting banking transfer/clearance)."}
                </Text>
              </View>

              {/* FORM INPUTS */}
              {payoutStatusTab === "paid" ? (
                <>
                  <Text className="text-foreground font-bold text-xs uppercase tracking-wider mb-1">
                    UTR / Bank Reference Number <Text className="text-red-500">*</Text>
                  </Text>
                  <TextInput
                    value={utrInput}
                    onChangeText={setUtrInput}
                    placeholder="e.g. 423589102451 / IMPS / UPI Ref ID"
                    placeholderTextColor="#647B98"
                    className="bg-background border border-border rounded-xl px-3 py-2.5 text-foreground font-mono text-xs mb-3"
                  />
                </>
              ) : (
                <>
                  <Text className="text-foreground font-bold text-xs uppercase tracking-wider mb-1">
                    Transaction / Tracking Reference (Optional)
                  </Text>
                  <TextInput
                    value={utrInput}
                    onChangeText={setUtrInput}
                    placeholder="Optional bank ref or internal tracking ID"
                    placeholderTextColor="#647B98"
                    className="bg-background border border-border rounded-xl px-3 py-2.5 text-foreground font-mono text-xs mb-3"
                  />
                </>
              )}

              <Text className="text-foreground font-bold text-xs uppercase tracking-wider mb-1">Source Account</Text>
              <TextInput
                value={sourceAccountInput}
                onChangeText={setSourceAccountInput}
                placeholder="e.g. RoyalLagn Business Current A/C"
                placeholderTextColor="#647B98"
                className="bg-background border border-border rounded-xl px-3 py-2.5 text-foreground text-xs mb-3"
              />

              <Text className="text-foreground font-bold text-xs uppercase tracking-wider mb-1">Operator Notes</Text>
              <TextInput
                value={payoutNotesInput}
                onChangeText={setPayoutNotesInput}
                placeholder="Optional reconciliation notes"
                placeholderTextColor="#647B98"
                className="bg-background border border-border rounded-xl px-3 py-2.5 text-foreground text-xs"
              />
            </ScrollView>

            {/* STICKY FOOTER ACTION BUTTONS */}
            <View className="flex-row items-center gap-2 sm:gap-2.5 p-4 sm:p-5 pt-3 border-t border-border shrink-0 bg-card">
              <Pressable
                onPress={() => setPayoutExecItem(null)}
                className="flex-1 py-3 rounded-xl bg-background border border-border items-center active:opacity-80"
              >
                <Text className="text-muted-foreground font-bold text-xs">Cancel</Text>
              </Pressable>
              <Pressable
                disabled={Boolean(actionInProgress)}
                onPress={() => void handlePayoutExecSubmit()}
                style={{
                  backgroundColor:
                    payoutStatusTab === "paid"
                      ? "#059669"
                      : payoutStatusTab === "processing"
                      ? "#2563EB"
                      : "#D97706",
                }}
                className="flex-1 py-3 rounded-xl items-center active:opacity-80"
              >
                <Text className="text-white font-bold text-xs">
                  {payoutStatusTab === "paid"
                    ? "Confirm Payment & Deduct"
                    : payoutStatusTab === "processing"
                    ? "Save as Processing"
                    : "Save as Payment Pending"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 5: VENDOR RECOMMENDATION & CHECKLIST                                */}
      {/* ========================================================================= */}
      <Modal visible={Boolean(vendorModalItem)} transparent animationType="fade" onRequestClose={() => setVendorModalItem(null)}>
        <View className="flex-1 bg-black/70 items-center justify-center p-3 sm:p-4">
          <View
            className="bg-card border border-border rounded-2xl sm:rounded-3xl w-full"
            style={{
              maxHeight: isMobile ? "94%" : "88%",
              maxWidth: 480,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <View className="flex-row items-center justify-between p-4 sm:p-5 pb-3 border-b border-border shrink-0">
              <View className="flex-1 pr-2 min-w-0">
                <Text className="text-foreground text-base sm:text-lg font-bold" numberOfLines={1}>Vendor Business Verification</Text>
                <Text className="text-muted-foreground text-xs" numberOfLines={1}>Verify details and submit recommendation</Text>
              </View>
              <Pressable onPress={() => setVendorModalItem(null)} className="p-1.5 rounded-xl bg-muted active:opacity-70 shrink-0">
                <X size={18} className="text-muted-foreground" />
              </Pressable>
            </View>

            <ScrollView
              style={{ flex: 1, minHeight: 0 }}
              contentContainerStyle={{ paddingHorizontal: isMobile ? 14 : 20, paddingVertical: 14 }}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              <View className="bg-background border border-border p-3.5 rounded-2xl mb-3">
                <Text className="text-foreground font-bold text-base">{vendorModalItem?.businessName}</Text>
                <Text className="text-muted-foreground text-xs mt-0.5">{vendorModalItem?.fullName} · {vendorModalItem?.categoryName}</Text>
                <Text className="text-muted-foreground text-xs mt-0.5">{vendorModalItem?.city}, {vendorModalItem?.state} - {vendorModalItem?.pincode}</Text>
              </View>

              <Text className="text-foreground font-bold text-xs uppercase tracking-wider mb-2">Verification Checklist</Text>

              <Pressable
                onPress={() => setVendorChecklist({ ...vendorChecklist, identityVerified: !vendorChecklist.identityVerified })}
                className="flex-row items-center gap-3 p-3 rounded-xl bg-background border border-border mb-2"
              >
                <View className={`w-5 h-5 rounded-md border items-center justify-center ${vendorChecklist.identityVerified ? "bg-emerald-600 border-emerald-600" : "border-border"}`}>
                  {vendorChecklist.identityVerified && <CheckCircle2 size={14} color="#FFF" />}
                </View>
                <Text className="text-foreground text-xs font-medium flex-1">Business Identity & Owner Details Verified</Text>
              </Pressable>

              <Pressable
                onPress={() => setVendorChecklist({ ...vendorChecklist, locationCoverageVerified: !vendorChecklist.locationCoverageVerified })}
                className="flex-row items-center gap-3 p-3 rounded-xl bg-background border border-border mb-2"
              >
                <View className={`w-5 h-5 rounded-md border items-center justify-center ${vendorChecklist.locationCoverageVerified ? "bg-emerald-600 border-emerald-600" : "border-border"}`}>
                  {vendorChecklist.locationCoverageVerified && <CheckCircle2 size={14} color="#FFF" />}
                </View>
                <Text className="text-foreground text-xs font-medium flex-1">Service Locations & Pincode Coverage Active</Text>
              </Pressable>

              <Pressable
                onPress={() => setVendorChecklist({ ...vendorChecklist, portfolioAuthentic: !vendorChecklist.portfolioAuthentic })}
                className="flex-row items-center gap-3 p-3 rounded-xl bg-background border border-border mb-4"
              >
                <View className={`w-5 h-5 rounded-md border items-center justify-center ${vendorChecklist.portfolioAuthentic ? "bg-emerald-600 border-emerald-600" : "border-border"}`}>
                  {vendorChecklist.portfolioAuthentic && <CheckCircle2 size={14} color="#FFF" />}
                </View>
                <Text className="text-foreground text-xs font-medium flex-1">Portfolio & Branding Authenticity Confirmed</Text>
              </Pressable>

              <Text className="text-foreground font-bold text-xs uppercase tracking-wider mb-1">Recommendation</Text>
              <View className="flex-row gap-2 mb-3">
                {[
                  { id: "recommended_approval", label: "Approve" },
                  { id: "needs_clarification", label: "Clarify" },
                  { id: "recommended_rejection", label: "Reject" },
                ].map((opt) => (
                  <Pressable
                    key={opt.id}
                    onPress={() => setVendorRec(opt.id as any)}
                    className={`flex-1 py-2.5 rounded-xl border items-center ${
                      vendorRec === opt.id ? "bg-primary border-primary" : "bg-card border-border"
                    }`}
                  >
                    <Text className={`text-xs font-bold ${vendorRec === opt.id ? "text-white" : "text-muted-foreground"}`}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Text className="text-foreground font-bold text-xs uppercase tracking-wider mb-1">Verifier Notes</Text>
              <TextInput
                value={vendorNotes}
                onChangeText={setVendorNotes}
                placeholder="Notes for approving manager"
                placeholderTextColor="#647B98"
                className="bg-background border border-border rounded-xl px-3 py-2.5 text-foreground text-xs"
              />
            </ScrollView>

            <View className="flex-row items-center gap-2 p-4 sm:p-5 pt-3 border-t border-border shrink-0 bg-card">
              <Pressable
                disabled={Boolean(actionInProgress)}
                onPress={() => void handleVendorRecSubmit()}
                className="flex-1 py-3 rounded-xl bg-primary items-center active:opacity-80"
              >
                <Text className="text-white font-bold text-xs">Submit Recommendation</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 6: REASSIGN TASK (Manager / Admin)                                  */}
      {/* ========================================================================= */}
      <Modal visible={Boolean(reassignModalTarget)} transparent animationType="fade" onRequestClose={() => setReassignModalTarget(null)}>
        <View className="flex-1 bg-black/70 items-center justify-center p-3 sm:p-4">
          <View className="bg-card border border-border rounded-2xl sm:rounded-3xl p-4 sm:p-5 w-full max-w-md">
            <Text className="text-foreground text-base sm:text-lg font-bold mb-1">Reassign Request</Text>
            <Text className="text-muted-foreground text-xs mb-3">Select another team member to balance workload.</Text>

            <ScrollView className="max-h-60 mb-4" showsVerticalScrollIndicator={false}>
              {teamMembers.map((m) => (
                <Pressable
                  key={m.userId}
                  onPress={() => setSelectedAssignee(m.userId)}
                  className={`p-3 rounded-xl border mb-2 flex-row items-center justify-between ${
                    selectedAssignee === m.userId ? "bg-primary/10 border-primary" : "bg-background border-border"
                  }`}
                >
                  <View>
                    <Text className="text-foreground font-bold text-xs">{m.fullName}</Text>
                    <Text className="text-muted-foreground text-[11px]">{m.email}</Text>
                  </View>
                  {selectedAssignee === m.userId && <CheckCircle2 size={16} color={pink} />}
                </Pressable>
              ))}
            </ScrollView>

            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => setReassignModalTarget(null)}
                className="flex-1 py-2.5 rounded-xl bg-card border border-border items-center"
              >
                <Text className="text-muted-foreground font-bold text-xs">Cancel</Text>
              </Pressable>
              <Pressable
                disabled={Boolean(actionInProgress)}
                onPress={() => void handleReassignSubmit()}
                className="flex-1 py-2.5 rounded-xl bg-primary items-center"
              >
                <Text className="text-white font-bold text-xs">Confirm Assignment</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 7: ESCALATE TASK                                                    */}
      {/* ========================================================================= */}
      <Modal visible={Boolean(escalateModalTarget)} transparent animationType="fade" onRequestClose={() => setEscalateModalTarget(null)}>
        <View className="flex-1 bg-black/70 items-center justify-center p-3 sm:p-4">
          <View className="bg-card border border-border rounded-2xl sm:rounded-3xl p-4 sm:p-5 w-full max-w-md">
            <Text className="text-foreground text-base sm:text-lg font-bold mb-1">Escalate to Manager / Admin</Text>
            <Text className="text-muted-foreground text-xs mb-3">Flag suspicious payment details or high-priority requests.</Text>

            <Text className="text-foreground font-bold text-xs uppercase tracking-wider mb-1">
              Escalation Reason <Text className="text-red-500">*</Text>
            </Text>
            <TextInput
              value={escalationReason}
              onChangeText={setEscalationReason}
              placeholder="e.g. Account name discrepancy exceeds tolerance, high amount"
              placeholderTextColor="#647B98"
              className="bg-background border border-border rounded-xl px-3 py-2.5 text-foreground text-xs mb-4 min-h-[80px]"
              multiline
            />

            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => setEscalateModalTarget(null)}
                className="flex-1 py-2.5 rounded-xl bg-card border border-border items-center"
              >
                <Text className="text-muted-foreground font-bold text-xs">Cancel</Text>
              </Pressable>
              <Pressable
                disabled={Boolean(actionInProgress)}
                onPress={() => void handleEscalateSubmit()}
                className="flex-1 py-2.5 rounded-xl bg-amber-600 items-center"
              >
                <Text className="text-white font-bold text-xs">Confirm Escalation</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 8: TEAM MEMBER PERMISSIONS (Admin only)                             */}
      {/* ========================================================================= */}
      <Modal visible={Boolean(memberModalItem !== null || memberEmail !== "")} transparent animationType="fade" onRequestClose={() => { setMemberModalItem(null); setMemberEmail(""); }}>
        <View className="flex-1 bg-black/70 items-center justify-center p-3 sm:p-4">
          <View className="bg-card border border-border rounded-2xl sm:rounded-3xl p-4 sm:p-5 w-full max-w-md max-h-[90vh]">
            <View className="flex-row items-center justify-between pb-3 border-b border-border">
              <Text className="text-foreground text-base sm:text-lg font-bold">{memberModalItem ? "Edit Permissions" : "Invite Team Member"}</Text>
              <Pressable onPress={() => { setMemberModalItem(null); setMemberEmail(""); }}>
                <X size={20} className="text-muted-foreground" />
              </Pressable>
            </View>

            <ScrollView className="py-4" showsVerticalScrollIndicator={false}>
              <Text className="text-foreground font-bold text-xs uppercase tracking-wider mb-1">Email Address</Text>
              <TextInput
                value={memberEmail}
                onChangeText={setMemberEmail}
                editable={!memberModalItem}
                placeholder="teammate@royallagn.com"
                placeholderTextColor="#647B98"
                className="bg-background border border-border rounded-xl px-3 py-2.5 text-foreground text-xs mb-3"
              />

              <Text className="text-foreground font-bold text-xs uppercase tracking-wider mb-1">Full Name</Text>
              <TextInput
                value={memberFullName}
                onChangeText={setMemberFullName}
                placeholder="Full Name"
                placeholderTextColor="#647B98"
                className="bg-background border border-border rounded-xl px-3 py-2.5 text-foreground text-xs mb-3"
              />

              <Text className="text-foreground font-bold text-xs uppercase tracking-wider mb-1">Phone</Text>
              <TextInput
                value={memberPhone}
                onChangeText={setMemberPhone}
                placeholder="Phone number"
                placeholderTextColor="#647B98"
                className="bg-background border border-border rounded-xl px-3 py-2.5 text-foreground text-xs mb-4"
              />

              <Text className="text-foreground font-bold text-xs uppercase tracking-wider mb-2">Granted Permissions</Text>
              {TEAM_PERMISSIONS.map((perm) => {
                const checked = memberPermissions.includes(perm);
                return (
                  <Pressable
                    key={perm}
                    onPress={() => {
                      if (checked) {
                        setMemberPermissions(memberPermissions.filter((p) => p !== perm));
                      } else {
                        setMemberPermissions([...memberPermissions, perm]);
                      }
                    }}
                    className={`flex-row items-center gap-3 p-3 rounded-xl border mb-2 ${
                      checked ? "bg-primary/10 border-primary" : "bg-background border-border"
                    }`}
                  >
                    <View className={`w-5 h-5 rounded-md border items-center justify-center ${checked ? "bg-primary border-primary" : "border-border"}`}>
                      {checked && <CheckCircle2 size={14} color="#FFF" />}
                    </View>
                    <View className="flex-1">
                      <Text className="text-foreground text-xs font-bold">{TEAM_PERMISSION_LABELS[perm]?.title || perm}</Text>
                      <Text className="text-muted-foreground text-[11px] leading-4">{TEAM_PERMISSION_LABELS[perm]?.description}</Text>
                    </View>
                  </Pressable>
                );
              })}

              <View className="flex-row items-center justify-between p-3 rounded-xl bg-background border border-border mt-2">
                <Text className="text-foreground text-xs font-bold">Account Active</Text>
                <Pressable
                  onPress={() => setMemberIsActive(!memberIsActive)}
                  className={`w-12 h-6 rounded-full px-1 justify-center ${memberIsActive ? "bg-emerald-600 items-end" : "bg-muted items-start"}`}
                >
                  <View className="w-4 h-4 rounded-full bg-white" />
                </Pressable>
              </View>
            </ScrollView>

            <View className="flex-row items-center gap-2 pt-3 border-t border-border">
              <Pressable
                onPress={() => { setMemberModalItem(null); setMemberEmail(""); }}
                className="flex-1 py-2.5 rounded-xl bg-card border border-border items-center"
              >
                <Text className="text-muted-foreground font-bold text-xs">Cancel</Text>
              </Pressable>
              <Pressable
                disabled={Boolean(actionInProgress)}
                onPress={() => void handleSaveMember()}
                className="flex-1 py-2.5 rounded-xl bg-primary items-center"
              >
                <Text className="text-white font-bold text-xs">Save Member</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: royalAdmin.border,
    backgroundColor: royalAdmin.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  headerButtonWide: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: royalAdmin.border,
    backgroundColor: royalAdmin.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerButtonText: {
    color: royalAdmin.navyDeep,
    fontSize: 13,
    fontWeight: "700",
  },
  headerDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: royalAdmin.gold,
  },
});

export default function TeamPortalScreen() {
  return (
    <TeamAuthProvider>
      <TeamPortalInner />
    </TeamAuthProvider>
  );
}
