import React from "react";
import FrontendScreen from "@/components/FrontendScreen";

export default function PrivacyPolicy() {
  return (
    <FrontendScreen
      title="Privacy Policy"
      subtitle="How RoyalLagn handles your information"
      mode="info"
      content={[
        "RoyalLagn uses the account, profile and activity information you provide -- such as your name, contact details, favorites and enquiries -- to operate your account and connect you with wedding vendors.",
        "Your information is not sold to third parties. It is used to run the marketplace, support your enquiries and improve your experience, and is retained only for as long as your account remains active.",
      ]}
    />
  );
}
