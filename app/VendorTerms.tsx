import React from "react";
import FrontendScreen from "@/components/FrontendScreen";

export default function VendorTerms() {
  return (
    <FrontendScreen
      title="Terms & Conditions"
      subtitle="Terms for using the RoyalLagn vendor workspace"
      mode="info"
      content={[
        "Vendors are responsible for keeping business details, pricing, portfolio media and availability accurate and for having permission to publish uploaded content.",
        "Customer enquiries do not create a confirmed booking. Vendors and customers should independently agree on availability, services, payment and cancellation terms.",
      ]}
    />
  );
}
