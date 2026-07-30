import React from "react";
import FrontendScreen from "@/components/FrontendScreen";

export default function VendorPrivacyPolicy() {
  return (
    <FrontendScreen
      title="Privacy Policy"
      subtitle="How RoyalLagn handles vendor information"
      mode="info"
      content={[
        "RoyalLagn uses the business, contact, portfolio and availability information you provide to operate your vendor profile and help customers discover your services.",
        "Account and activity information should only be used for operating the platform, supporting enquiries and improving the vendor experience. Review this policy whenever data collection, retention or sharing practices change.",
      ]}
    />
  );
}
