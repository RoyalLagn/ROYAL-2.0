export type CrmSalesExecutive = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CrmSalesExecutiveInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  isActive?: boolean;
};
