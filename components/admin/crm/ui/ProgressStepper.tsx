import React from "react";
import { Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { crmPipelineStages, type CrmVendorStatus } from "@/types/crm/vendor";

// Maps any of the 15 detailed statuses onto the 6-stage pipeline stepper.
const stageIndexByStatus: Record<CrmVendorStatus, number> = {
  not_contacted: 0,
  contact_attempted: 1,
  call_not_answered: 1,
  not_interested: 1,
  interested: 1,
  follow_up_required: 1,
  documents_pending: 1,
  meeting_scheduled: 2,
  meeting_completed: 2,
  registered_on_royallagn: 3,
  subscription_pending: 4,
  premium_customer: 5,
  rejected: 0,
  closed: 0,
  lost_lead: 0,
};

export function ProgressStepper({ status }: { status: CrmVendorStatus }) {
  const activeIndex = stageIndexByStatus[status];
  return (
    <View className="flex-row items-center">
      {crmPipelineStages.map((stage, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;
        const isLast = index === crmPipelineStages.length - 1;
        return (
          <View key={stage.status} className={isLast ? "items-center" : "items-center flex-1"}>
            <View className="flex-row items-center w-full">
              <View
                className={`w-6 h-6 rounded-full items-center justify-center ${
                  done ? "bg-primary" : active ? "bg-primary/20 border-2 border-primary" : "bg-muted"
                }`}
              >
                {done ? (
                  <Check size={12} color="#FFFFFF" />
                ) : (
                  <Text className={`text-metadata font-bold ${active ? "text-primary" : "text-muted-foreground"}`}>
                    {index + 1}
                  </Text>
                )}
              </View>
              {!isLast ? <View className={`flex-1 h-0.5 ${done ? "bg-primary" : "bg-border"}`} /> : null}
            </View>
            <Text
              className={`text-caption mt-1 text-center ${active ? "text-primary font-semibold" : "text-muted-foreground"}`}
              numberOfLines={1}
            >
              {stage.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
