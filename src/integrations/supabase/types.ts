export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      agent_access_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
        }
        Relationships: []
      }
      balance_custody: {
        Row: {
          crate_type: string
          custody_id: string
          depot_id: string
          due_date: string
          issued: number
          last_event_offset: number | null
          outstanding: number
          returned: number
          status: string
          updated_at: string
        }
        Insert: {
          crate_type: string
          custody_id: string
          depot_id: string
          due_date: string
          issued: number
          last_event_offset?: number | null
          outstanding: number
          returned: number
          status: string
          updated_at?: string
        }
        Update: {
          crate_type?: string
          custody_id?: string
          depot_id?: string
          due_date?: string
          issued?: number
          last_event_offset?: number | null
          outstanding?: number
          returned?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      balance_depot: {
        Row: {
          depot_id: string
          depot_name: string
          issued: number
          outstanding: number
          returned: number
          updated_at: string
        }
        Insert: {
          depot_id: string
          depot_name: string
          issued?: number
          outstanding?: number
          returned?: number
          updated_at?: string
        }
        Update: {
          depot_id?: string
          depot_name?: string
          issued?: number
          outstanding?: number
          returned?: number
          updated_at?: string
        }
        Relationships: []
      }
      balance_ledger: {
        Row: {
          created_at: string
          custody_id: string
          delta_issued: number
          delta_returned: number
          depot_id: string
          event_offset: number
          event_type: string
          id: number
          outstanding_after: number
        }
        Insert: {
          created_at?: string
          custody_id: string
          delta_issued?: number
          delta_returned?: number
          depot_id: string
          event_offset: number
          event_type: string
          id?: number
          outstanding_after: number
        }
        Update: {
          created_at?: string
          custody_id?: string
          delta_issued?: number
          delta_returned?: number
          depot_id?: string
          event_offset?: number
          event_type?: string
          id?: number
          outstanding_after?: number
        }
        Relationships: []
      }
      crate_asset_crates: {
        Row: {
          condition: string
          crate_type: string
          holder_ref: string | null
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          condition?: string
          crate_type: string
          holder_ref?: string | null
          id: string
          status?: string
          updated_at?: string
        }
        Update: {
          condition?: string
          crate_type?: string
          holder_ref?: string | null
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crate_asset_crates_crate_type_fkey"
            columns: ["crate_type"]
            isOneToOne: false
            referencedRelation: "crate_asset_types"
            referencedColumns: ["code"]
          },
        ]
      }
      crate_asset_types: {
        Row: {
          capacity_l: number
          code: string
          label: string
        }
        Insert: {
          capacity_l: number
          code: string
          label: string
        }
        Update: {
          capacity_l?: number
          code?: string
          label?: string
        }
        Relationships: []
      }
      custody_agents: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      custody_depots: {
        Row: {
          city: string
          id: string
          name: string
        }
        Insert: {
          city: string
          id: string
          name: string
        }
        Update: {
          city?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      custody_records: {
        Row: {
          crate_type: string
          created_at: string
          custody_id: string
          delivery_agent: string
          depot_id: string
          due_date: string
          issue_date: string
          issued_qty: number
          returned_qty: number
          status: string
        }
        Insert: {
          crate_type: string
          created_at?: string
          custody_id: string
          delivery_agent: string
          depot_id: string
          due_date: string
          issue_date?: string
          issued_qty: number
          returned_qty?: number
          status?: string
        }
        Update: {
          crate_type?: string
          created_at?: string
          custody_id?: string
          delivery_agent?: string
          depot_id?: string
          due_date?: string
          issue_date?: string
          issued_qty?: number
          returned_qty?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "custody_records_delivery_agent_fkey"
            columns: ["delivery_agent"]
            isOneToOne: false
            referencedRelation: "custody_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custody_records_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "custody_depots"
            referencedColumns: ["id"]
          },
        ]
      }
      custody_return_scans: {
        Row: {
          crate_ids: string[]
          created_at: string
          custody_id: string
          id: number
          qty: number
          scanned_by: string
        }
        Insert: {
          crate_ids?: string[]
          created_at?: string
          custody_id: string
          id?: number
          qty: number
          scanned_by: string
        }
        Update: {
          crate_ids?: string[]
          created_at?: string
          custody_id?: string
          id?: number
          qty?: number
          scanned_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "custody_return_scans_custody_id_fkey"
            columns: ["custody_id"]
            isOneToOne: false
            referencedRelation: "custody_records"
            referencedColumns: ["custody_id"]
          },
        ]
      }
      event_bus: {
        Row: {
          consumed_at: string | null
          consumer: string | null
          created_at: string
          error: string | null
          event_type: string
          key: string
          offset: number
          payload: Json
          producer: string
          status: string
          topic: string
        }
        Insert: {
          consumed_at?: string | null
          consumer?: string | null
          created_at?: string
          error?: string | null
          event_type: string
          key: string
          offset?: number
          payload: Json
          producer: string
          status?: string
          topic?: string
        }
        Update: {
          consumed_at?: string | null
          consumer?: string | null
          created_at?: string
          error?: string | null
          event_type?: string
          key?: string
          offset?: number
          payload?: Json
          producer?: string
          status?: string
          topic?: string
        }
        Relationships: []
      }
      gateway_log: {
        Row: {
          created_at: string
          decision: string
          id: number
          latency_ms: number | null
          method: string
          path: string
          reason: string | null
          role: string | null
          status_code: number
          target_service: string | null
          user_email: string | null
        }
        Insert: {
          created_at?: string
          decision: string
          id?: number
          latency_ms?: number | null
          method: string
          path: string
          reason?: string | null
          role?: string | null
          status_code: number
          target_service?: string | null
          user_email?: string | null
        }
        Update: {
          created_at?: string
          decision?: string
          id?: number
          latency_ms?: number | null
          method?: string
          path?: string
          reason?: string | null
          role?: string | null
          status_code?: number
          target_service?: string | null
          user_email?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      service_registry: {
        Row: {
          instance_id: string
          last_heartbeat: string
          name: string
          status: string
          url: string
        }
        Insert: {
          instance_id: string
          last_heartbeat?: string
          name: string
          status?: string
          url: string
        }
        Update: {
          instance_id?: string
          last_heartbeat?: string
          name?: string
          status?: string
          url?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          depot_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          depot_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          depot_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      balance_recompute_depots: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_depots: {
        Args: never
        Returns: {
          city: string
          id: string
          name: string
        }[]
      }
      seed_demo: { Args: never; Returns: undefined }
      seed_demo_custody: {
        Args: {
          _agent: string
          _depot: string
          _due: string
          _id: string
          _issue: string
          _issued: number
          _returned: number
          _type: string
        }
        Returns: undefined
      }
      user_depot: { Args: { _user_id: string }; Returns: string }
    }
    Enums: {
      app_role: "deliveryAgent" | "customerDepot"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["deliveryAgent", "customerDepot"],
    },
  },
} as const
