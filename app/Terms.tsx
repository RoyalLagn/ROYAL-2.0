import React from "react";
import FrontendScreen from "@/components/FrontendScreen";

export default function Terms() {
  return (
    <FrontendScreen
      title="Terms & Conditions"
      subtitle="Terms for using RoyalLagn"
      mode="info"
      content={[
        "RoyalLagn connects couples with independent wedding vendors. Sending an enquiry does not create a confirmed booking with a vendor.",
        "Users should independently confirm vendor availability, services, pricing and cancellation terms directly with the vendor before making arrangements.",
      ]}
    />
  );
}
