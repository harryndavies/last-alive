
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
            "cards": {
                  Row: {
                    "created_at": string,"game_id": string,"id": string,"kind": Database["public"]['Enums']["card_kind"],"submitted_by": string,"text": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"game_id": string,"id"?: string,"kind": Database["public"]['Enums']["card_kind"],"submitted_by": string,"text": string
                  }
                  Update: {
                    "created_at"?: string,"game_id"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["card_kind"],"submitted_by"?: string,"text"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cards_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cards_submitted_by_fkey"
      columns: ["submitted_by"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "created_at": string,"game_id": string,"id": number,"payload": NonNullable<Json>,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"game_id": string,"id"?: never,"payload"?: NonNullable<Json>,"type": string
                  }
                  Update: {
                    "created_at"?: string,"game_id"?: string,"id"?: never,"payload"?: NonNullable<Json>,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    }
                  ]
                },"games": {
                  Row: {
                    "code": string,"created_at": string,"finished_at": string | null,"host_player_id": string | null,"id": string,"name": string,"started_at": string | null,"status": Database["public"]['Enums']["game_status"],"winner_player_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"finished_at"?: string | null,"host_player_id"?: string | null,"id"?: string,"name": string,"started_at"?: string | null,"status"?: Database["public"]['Enums']["game_status"],"winner_player_id"?: string | null
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"finished_at"?: string | null,"host_player_id"?: string | null,"id"?: string,"name"?: string,"started_at"?: string | null,"status"?: Database["public"]['Enums']["game_status"],"winner_player_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "games_host_fk"
      columns: ["host_player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "games_winner_fk"
      columns: ["winner_player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"kills": {
                  Row: {
                    "created_at": string,"game_id": string,"id": string,"killer_id": string,"mission_id": string,"note": string | null,"photo_path": string | null,"resolved_at": string | null,"resolved_by": string | null,"status": Database["public"]['Enums']["kill_status"],"victim_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"game_id": string,"id"?: string,"killer_id": string,"mission_id": string,"note"?: string | null,"photo_path"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: Database["public"]['Enums']["kill_status"],"victim_id": string
                  }
                  Update: {
                    "created_at"?: string,"game_id"?: string,"id"?: string,"killer_id"?: string,"mission_id"?: string,"note"?: string | null,"photo_path"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: Database["public"]['Enums']["kill_status"],"victim_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "kills_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "kills_killer_id_fkey"
      columns: ["killer_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "kills_mission_id_fkey"
      columns: ["mission_id"]
isOneToOne: false
      referencedRelation: "missions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "kills_victim_id_fkey"
      columns: ["victim_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"missions": {
                  Row: {
                    "created_at": string,"ended_at": string | null,"game_id": string,"hunter_id": string,"id": string,"inherited_from": string | null,"is_active": boolean,"phrase_card_id": string,"place_card_id": string,"target_id": string,"weapon_card_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"ended_at"?: string | null,"game_id": string,"hunter_id": string,"id"?: string,"inherited_from"?: string | null,"is_active"?: boolean,"phrase_card_id": string,"place_card_id": string,"target_id": string,"weapon_card_id": string
                  }
                  Update: {
                    "created_at"?: string,"ended_at"?: string | null,"game_id"?: string,"hunter_id"?: string,"id"?: string,"inherited_from"?: string | null,"is_active"?: boolean,"phrase_card_id"?: string,"place_card_id"?: string,"target_id"?: string,"weapon_card_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "missions_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "missions_hunter_id_fkey"
      columns: ["hunter_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "missions_inherited_from_fkey"
      columns: ["inherited_from"]
isOneToOne: false
      referencedRelation: "missions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "missions_phrase_card_id_fkey"
      columns: ["phrase_card_id"]
isOneToOne: false
      referencedRelation: "cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "missions_place_card_id_fkey"
      columns: ["place_card_id"]
isOneToOne: false
      referencedRelation: "cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "missions_target_id_fkey"
      columns: ["target_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "missions_weapon_card_id_fkey"
      columns: ["weapon_card_id"]
isOneToOne: false
      referencedRelation: "cards"
      referencedColumns: ["id"]
    }
                  ]
                },"players": {
                  Row: {
                    "cards_locked": boolean,"colour": string,"created_at": string,"died_at": string | null,"game_id": string,"id": string,"is_host": boolean,"killed_by": string | null,"kills_count": number,"name": string,"status": Database["public"]['Enums']["player_status"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cards_locked"?: boolean,"colour": string,"created_at"?: string,"died_at"?: string | null,"game_id": string,"id"?: string,"is_host"?: boolean,"killed_by"?: string | null,"kills_count"?: number,"name": string,"status"?: Database["public"]['Enums']["player_status"],"user_id": string
                  }
                  Update: {
                    "cards_locked"?: boolean,"colour"?: string,"created_at"?: string,"died_at"?: string | null,"game_id"?: string,"id"?: string,"is_host"?: boolean,"killed_by"?: string | null,"kills_count"?: number,"name"?: string,"status"?: Database["public"]['Enums']["player_status"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "players_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "players_killed_by_fkey"
      columns: ["killed_by"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "create_game":
{ Args: { "p_colour": string,"p_game_name": string,"p_player_name": string }; Returns: Json
                           },
"game_preview":
{ Args: { "p_code": string }; Returns: Json
                           },
"games_due_for_cleanup":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"get_kill_claim":
{ Args: { "p_kill_id": string }; Returns: Json
                           },
"join_game":
{ Args: { "p_code": string,"p_colour": string,"p_name": string }; Returns: Json
                           },
"kill_photo_paths":
{ Args: { "p_game_ids": (string)[] }; Returns: string[]
                           },
"leave_game":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"reclaim_player":
{ Args: { "p_code": string,"p_name": string,"p_pin": string }; Returns: Json
                           },
"remove_player":
{ Args: { "p_game_id": string,"p_player_id": string }; Returns: undefined
                           },
"report_kill":
{ Args: { "p_game_id": string,"p_note"?: string,"p_photo_path"?: string,"p_victim_id": string }; Returns: string
                           },
"resolve_dispute":
{ Args: { "p_confirm": boolean,"p_kill_id": string }; Returns: Database["public"]['Enums']["kill_status"]
                           },
"respond_to_kill":
{ Args: { "p_confirm": boolean,"p_kill_id": string }; Returns: Database["public"]['Enums']["kill_status"]
                           },
"start_game":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"start_picking":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"submit_cards":
{ Args: { "p_game_id": string,"p_phrase": string,"p_place": string,"p_weapon": string }; Returns: undefined
                           }
          }
          Enums: {
            "card_kind": "weapon"|"place"|"phrase","game_status": "lobby"|"picking"|"active"|"finished","kill_status": "pending"|"confirmed"|"disputed"|"rejected","player_status": "alive"|"dead"
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
            "card_kind": ["weapon", "place", "phrase"],"game_status": ["lobby", "picking", "active", "finished"],"kill_status": ["pending", "confirmed", "disputed", "rejected"],"player_status": ["alive", "dead"]
          }
        }
} as const
