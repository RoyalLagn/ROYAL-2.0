import React from "react";
import FrontendScreen from "@/components/FrontendScreen";
import { useCategories } from "@/context/CategoryContext";

export default function AdminCategories() {
  const { categories } = useCategories();
  return (
    <FrontendScreen
      title="Category Management"
      subtitle="Manage marketplace categories"
      mode="list"
      items={categories.map((category) => `${category.name} (${category.vendorCount})`)}
    />
  );
}
