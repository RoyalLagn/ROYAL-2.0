export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string;
          description: string;
          fallback_image_url: string | null;
          id: string;
          icon_url: string | null;
          is_active: boolean;
          is_featured: boolean;
          localization_key: string | null;
          name: string;
          show_in_search: boolean;
          show_in_vendor_registration: boolean;
          show_on_home: boolean;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string;
          fallback_image_url?: string | null;
          id?: string;
          icon_url?: string | null;
          is_active?: boolean;
          is_featured?: boolean;
          localization_key?: string | null;
          name: string;
          show_in_search?: boolean;
          show_in_vendor_registration?: boolean;
          show_on_home?: boolean;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          fallback_image_url?: string | null;
          id?: string;
          icon_url?: string | null;
          is_active?: boolean;
          is_featured?: boolean;
          localization_key?: string | null;
          name?: string;
          show_in_search?: boolean;
          show_in_vendor_registration?: boolean;
          show_on_home?: boolean;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      favorites: {
        Row: {
          created_at: string;
          id: string;
          profile_id: string;
          vendor_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          profile_id: string;
          vendor_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          profile_id?: string;
          vendor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "favorites_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "favorites_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          is_active: boolean;
          phone: string | null;
          profile_image: string | null;
          role: Database["public"]["Enums"]["app_role"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          full_name: string;
          id: string;
          is_active?: boolean;
          phone?: string | null;
          profile_image?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          full_name?: string;
          id?: string;
          is_active?: boolean;
          phone?: string | null;
          profile_image?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
        };
        Relationships: [];
      };
      reviews: {
        Row: {
          created_at: string;
          id: string;
          profile_id: string;
          rating: number;
          review: string;
          vendor_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          profile_id: string;
          rating: number;
          review: string;
          vendor_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          profile_id?: string;
          rating?: number;
          review?: string;
          vendor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          created_at: string;
          end_date: string;
          id: string;
          plan_name: string;
          start_date: string;
          status: Database["public"]["Enums"]["subscription_status"];
          vendor_id: string;
        };
        Insert: {
          created_at?: string;
          end_date: string;
          id?: string;
          plan_name: string;
          start_date: string;
          status?: Database["public"]["Enums"]["subscription_status"];
          vendor_id: string;
        };
        Update: {
          created_at?: string;
          end_date?: string;
          id?: string;
          plan_name?: string;
          start_date?: string;
          status?: Database["public"]["Enums"]["subscription_status"];
          vendor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      vendor_availability: {
        Row: {
          created_at: string;
          date: string;
          id: string;
          status: Database["public"]["Enums"]["vendor_availability_status"];
          updated_at: string;
          vendor_id: string;
        };
        Insert: {
          created_at?: string;
          date: string;
          id?: string;
          status?: Database["public"]["Enums"]["vendor_availability_status"];
          updated_at?: string;
          vendor_id: string;
        };
        Update: {
          created_at?: string;
          date?: string;
          id?: string;
          status?: Database["public"]["Enums"]["vendor_availability_status"];
          updated_at?: string;
          vendor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vendor_availability_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      vendor_services: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          image_url: string | null;
          is_active: boolean;
          price: number | null;
          title: string;
          updated_at: string;
          vendor_id: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          price?: number | null;
          title: string;
          updated_at?: string;
          vendor_id: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          price?: number | null;
          title?: string;
          updated_at?: string;
          vendor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vendor_services_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      vendors: {
        Row: {
          address: string | null;
          business_name: string;
          category_id: string;
          city: string;
          country: string;
          created_at: string;
          description: string | null;
          experience: number | null;
          facebook: string | null;
          id: string;
          instagram: string | null;
          is_featured: boolean;
          is_verified: boolean;
          owner_name: string;
          profile_id: string;
          state: string;
          subscription_status: Database["public"]["Enums"]["subscription_status"];
          updated_at: string;
          website: string | null;
        };
        Insert: {
          address?: string | null;
          business_name: string;
          category_id: string;
          city: string;
          country?: string;
          created_at?: string;
          description?: string | null;
          experience?: number | null;
          facebook?: string | null;
          id?: string;
          instagram?: string | null;
          is_featured?: boolean;
          is_verified?: boolean;
          owner_name: string;
          profile_id: string;
          state: string;
          subscription_status?: Database["public"]["Enums"]["subscription_status"];
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          address?: string | null;
          business_name?: string;
          category_id?: string;
          city?: string;
          country?: string;
          created_at?: string;
          description?: string | null;
          experience?: number | null;
          facebook?: string | null;
          id?: string;
          instagram?: string | null;
          is_featured?: boolean;
          is_verified?: boolean;
          owner_name?: string;
          profile_id?: string;
          state?: string;
          subscription_status?: Database["public"]["Enums"]["subscription_status"];
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "vendors_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vendors_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      app_role: "public_user" | "vendor" | "admin";
      subscription_status: "pending" | "active" | "expired" | "cancelled";
      vendor_availability_status: "available" | "tentative" | "blocked";
    };
    CompositeTypes: Record<string, never>;
  };
};

type PublicSchema = Database["public"];

export type Tables<
  TableName extends keyof PublicSchema["Tables"],
> = PublicSchema["Tables"][TableName]["Row"];

export type TablesInsert<
  TableName extends keyof PublicSchema["Tables"],
> = PublicSchema["Tables"][TableName]["Insert"];

export type TablesUpdate<
  TableName extends keyof PublicSchema["Tables"],
> = PublicSchema["Tables"][TableName]["Update"];

export type Enums<
  EnumName extends keyof PublicSchema["Enums"],
> = PublicSchema["Enums"][EnumName];
