
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "bid_revisions": {
                  Row: {
                    "bid_id": string,"created_at": string,"id": string,"note": string,"price": number,"revision_no": number,"status": string,"turnaround_days": number
                  }
                  Insert: {
                    "bid_id": string,"created_at"?: string,"id"?: string,"note": string,"price": number,"revision_no": number,"status": string,"turnaround_days": number
                  }
                  Update: {
                    "bid_id"?: string,"created_at"?: string,"id"?: string,"note"?: string,"price"?: number,"revision_no"?: number,"status"?: string,"turnaround_days"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "bid_revisions_bid_id_fkey"
      columns: ["bid_id"]
isOneToOne: false
      referencedRelation: "bids"
      referencedColumns: ["id"]
    }
                  ]
                },"bids": {
                  Row: {
                    "created_at": string,"id": string,"note": string,"price": number,"request_id": string,"status": string,"tailor_id": string,"turnaround_days": number,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"note"?: string,"price": number,"request_id": string,"status"?: string,"tailor_id"?: string,"turnaround_days": number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"note"?: string,"price"?: number,"request_id"?: string,"status"?: string,"tailor_id"?: string,"turnaround_days"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bids_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bids_tailor_id_fkey"
      columns: ["tailor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "body": string,"created_at": string,"id": string,"order_id": string,"sender_id": string
                  }
                  Insert: {
                    "body": string,"created_at"?: string,"id"?: string,"order_id": string,"sender_id"?: string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"id"?: string,"order_id"?: string,"sender_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "bid_id": string,"completed_at": string | null,"created_at": string,"customer_id": string,"id": string,"price": number,"request_id": string,"status": string,"tailor_id": string,"turnaround_days": number,"updated_at": string
                  }
                  Insert: {
                    "bid_id": string,"completed_at"?: string | null,"created_at"?: string,"customer_id": string,"id"?: string,"price": number,"request_id": string,"status"?: string,"tailor_id": string,"turnaround_days": number,"updated_at"?: string
                  }
                  Update: {
                    "bid_id"?: string,"completed_at"?: string | null,"created_at"?: string,"customer_id"?: string,"id"?: string,"price"?: number,"request_id"?: string,"status"?: string,"tailor_id"?: string,"turnaround_days"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_bid_id_fkey"
      columns: ["bid_id"]
isOneToOne: true
      referencedRelation: "bids"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_request_id_fkey"
      columns: ["request_id"]
isOneToOne: true
      referencedRelation: "requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_tailor_id_fkey"
      columns: ["tailor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"id": string,"role": string
                  }
                  Insert: {
                    "created_at"?: string,"display_name"?: string,"id": string,"role": string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"id"?: string,"role"?: string
                  }
                  Relationships: [
                    
                  ]
                },"requests": {
                  Row: {
                    "closed_at": string | null,"created_at": string,"customer_id": string,"description": string,"id": string,"photo_path": string | null,"status": string,"title": string
                  }
                  Insert: {
                    "closed_at"?: string | null,"created_at"?: string,"customer_id"?: string,"description": string,"id"?: string,"photo_path"?: string | null,"status"?: string,"title": string
                  }
                  Update: {
                    "closed_at"?: string | null,"created_at"?: string,"customer_id"?: string,"description"?: string,"id"?: string,"photo_path"?: string | null,"status"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "requests_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"reviews": {
                  Row: {
                    "comment": string,"created_at": string,"customer_id": string,"id": string,"order_id": string,"rating": number,"tailor_id": string
                  }
                  Insert: {
                    "comment"?: string,"created_at"?: string,"customer_id"?: string,"id"?: string,"order_id": string,"rating": number,"tailor_id": string
                  }
                  Update: {
                    "comment"?: string,"created_at"?: string,"customer_id"?: string,"id"?: string,"order_id"?: string,"rating"?: number,"tailor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reviews_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_order_id_fkey"
      columns: ["order_id"]
isOneToOne: true
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_tailor_id_fkey"
      columns: ["tailor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_bid":
{ Args: { "p_bid_id": string,"p_expected_price": number,"p_expected_turnaround": number }; Returns: string
                           },
"advance_order":
{ Args: { "p_expected_status": string,"p_order_id": string }; Returns: string
                           },
"decline_bid":
{ Args: { "p_bid_id": string }; Returns: undefined
                           },
"is_order_participant":
{ Args: { "p_order_id": string }; Returns: boolean
                           },
"my_role":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"request_bid_stats":
{ Args: { "p_request_id": string }; Returns: {
              "avg_price": number,"avg_turnaround": number,"bid_count": number
            }[]
                           },
"request_is_open":
{ Args: { "p_request_id": string }; Returns: boolean
                           },
"tailor_stats":
{ Args: { "p_tailor_id": string }; Returns: {
              "avg_rating": number,"completed_orders": number,"review_count": number
            }[]
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
