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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      adherent_incorporations: {
        Row: {
          activated_beneficiary_id: string | null
          adherent_amount: number | null
          adherent_birth_date: string | null
          adherent_document_number: string | null
          adherent_document_type: string | null
          adherent_email: string | null
          adherent_first_name: string
          adherent_last_name: string
          adherent_phone: string | null
          adherent_plan_id: string | null
          adherent_relationship: string | null
          cascade_dependents: boolean
          client_id: string
          company_id: string
          completed_at: string | null
          coverage_end_date: string | null
          coverage_start_date: string | null
          created_at: string
          created_by: string | null
          deactivated_beneficiary_ids: string[] | null
          document_id: string | null
          id: string
          member_role: string
          movement_type: string
          notes: string | null
          operation_beneficiary_id: string | null
          operation_sale_id: string
          parent_sale_id: string | null
          parent_target_beneficiary_id: string | null
          plan_id: string | null
          signature_link_id: string | null
          source: string
          status: string
          target_beneficiary_id: string | null
          termination_date: string | null
          termination_reason: string | null
          titular_document: string | null
          titular_email: string | null
          titular_name: string
          titular_phone: string | null
          updated_at: string
        }
        Insert: {
          activated_beneficiary_id?: string | null
          adherent_amount?: number | null
          adherent_birth_date?: string | null
          adherent_document_number?: string | null
          adherent_document_type?: string | null
          adherent_email?: string | null
          adherent_first_name: string
          adherent_last_name: string
          adherent_phone?: string | null
          adherent_plan_id?: string | null
          adherent_relationship?: string | null
          cascade_dependents?: boolean
          client_id: string
          company_id: string
          completed_at?: string | null
          coverage_end_date?: string | null
          coverage_start_date?: string | null
          created_at?: string
          created_by?: string | null
          deactivated_beneficiary_ids?: string[] | null
          document_id?: string | null
          id?: string
          member_role?: string
          movement_type?: string
          notes?: string | null
          operation_beneficiary_id?: string | null
          operation_sale_id: string
          parent_sale_id?: string | null
          parent_target_beneficiary_id?: string | null
          plan_id?: string | null
          signature_link_id?: string | null
          source?: string
          status?: string
          target_beneficiary_id?: string | null
          termination_date?: string | null
          termination_reason?: string | null
          titular_document?: string | null
          titular_email?: string | null
          titular_name: string
          titular_phone?: string | null
          updated_at?: string
        }
        Update: {
          activated_beneficiary_id?: string | null
          adherent_amount?: number | null
          adherent_birth_date?: string | null
          adherent_document_number?: string | null
          adherent_document_type?: string | null
          adherent_email?: string | null
          adherent_first_name?: string
          adherent_last_name?: string
          adherent_phone?: string | null
          adherent_plan_id?: string | null
          adherent_relationship?: string | null
          cascade_dependents?: boolean
          client_id?: string
          company_id?: string
          completed_at?: string | null
          coverage_end_date?: string | null
          coverage_start_date?: string | null
          created_at?: string
          created_by?: string | null
          deactivated_beneficiary_ids?: string[] | null
          document_id?: string | null
          id?: string
          member_role?: string
          movement_type?: string
          notes?: string | null
          operation_beneficiary_id?: string | null
          operation_sale_id?: string
          parent_sale_id?: string | null
          parent_target_beneficiary_id?: string | null
          plan_id?: string | null
          signature_link_id?: string | null
          source?: string
          status?: string
          target_beneficiary_id?: string | null
          termination_date?: string | null
          termination_reason?: string | null
          titular_document?: string | null
          titular_email?: string | null
          titular_name?: string
          titular_phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "adherent_incorporations_activated_beneficiary_id_fkey"
            columns: ["activated_beneficiary_id"]
            isOneToOne: false
            referencedRelation: "beneficiaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adherent_incorporations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adherent_incorporations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adherent_incorporations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adherent_incorporations_operation_beneficiary_id_fkey"
            columns: ["operation_beneficiary_id"]
            isOneToOne: false
            referencedRelation: "beneficiaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adherent_incorporations_operation_sale_id_fkey"
            columns: ["operation_sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adherent_incorporations_operation_sale_id_fkey"
            columns: ["operation_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adherent_incorporations_operation_sale_id_fkey"
            columns: ["operation_sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adherent_incorporations_parent_sale_id_fkey"
            columns: ["parent_sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adherent_incorporations_parent_sale_id_fkey"
            columns: ["parent_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adherent_incorporations_parent_sale_id_fkey"
            columns: ["parent_sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adherent_incorporations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adherent_incorporations_signature_link_id_fkey"
            columns: ["signature_link_id"]
            isOneToOne: false
            referencedRelation: "signature_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ai_adherent_plan"
            columns: ["adherent_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ai_parent_target_beneficiary"
            columns: ["parent_target_beneficiary_id"]
            isOneToOne: false
            referencedRelation: "beneficiaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ai_target_beneficiary"
            columns: ["target_beneficiary_id"]
            isOneToOne: false
            referencedRelation: "beneficiaries"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_comments: {
        Row: {
          audit_action: string | null
          comment: string
          created_at: string
          id: string
          sale_id: string
          sale_status_at_comment: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          audit_action?: string | null
          comment: string
          created_at?: string
          id?: string
          sale_id: string
          sale_status_at_comment?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          audit_action?: string | null
          comment?: string
          created_at?: string
          id?: string
          sale_id?: string
          sale_status_at_comment?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_comments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_comments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_comments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          company_id: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          new_values: Json | null
          old_values: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_processes: {
        Row: {
          auditor_id: string | null
          completed_at: string | null
          created_at: string | null
          id: string
          notes: string | null
          sale_id: string
          started_at: string | null
          status: string | null
        }
        Insert: {
          auditor_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          sale_id: string
          started_at?: string | null
          status?: string | null
        }
        Update: {
          auditor_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          sale_id?: string
          started_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_processes_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_processes_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_processes_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_attempts: {
        Row: {
          company_id: string | null
          created_at: string | null
          email: string
          failure_reason: string | null
          id: string
          ip_address: string | null
          success: boolean | null
          user_agent: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          email: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean | null
          user_agent?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          email?: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean | null
          user_agent?: string | null
        }
        Relationships: []
      }
      available_permissions: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          permission_key: string
          permission_name: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          permission_key: string
          permission_name: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          permission_key?: string
          permission_name?: string
        }
        Relationships: []
      }
      beneficiaries: {
        Row: {
          activated_at: string | null
          address: string | null
          amount: number | null
          barrio: string | null
          birth_date: string | null
          city: string | null
          coverage_end_date: string | null
          coverage_start_date: string | null
          created_at: string | null
          dni: string | null
          document_number: string | null
          document_type: string | null
          email: string | null
          entry_date: string | null
          first_name: string
          gender: string | null
          has_preexisting_conditions: boolean | null
          id: string
          immediate_coverage: boolean | null
          is_primary: boolean | null
          last_name: string
          marital_status: string | null
          maternity_bonus: boolean
          member_role: string
          occupation: string | null
          parent_beneficiary_id: string | null
          phone: string | null
          plan_id: string | null
          postal_code: string | null
          preexisting_conditions_detail: string | null
          province: string | null
          relationship: string | null
          requires_adherents: boolean
          sale_id: string
          signature_link_id: string | null
          signature_required: boolean | null
          source_addendum_id: string | null
          source_incorporation_id: string | null
          status: string
        }
        Insert: {
          activated_at?: string | null
          address?: string | null
          amount?: number | null
          barrio?: string | null
          birth_date?: string | null
          city?: string | null
          coverage_end_date?: string | null
          coverage_start_date?: string | null
          created_at?: string | null
          dni?: string | null
          document_number?: string | null
          document_type?: string | null
          email?: string | null
          entry_date?: string | null
          first_name: string
          gender?: string | null
          has_preexisting_conditions?: boolean | null
          id?: string
          immediate_coverage?: boolean | null
          is_primary?: boolean | null
          last_name: string
          marital_status?: string | null
          maternity_bonus?: boolean
          member_role?: string
          occupation?: string | null
          parent_beneficiary_id?: string | null
          phone?: string | null
          plan_id?: string | null
          postal_code?: string | null
          preexisting_conditions_detail?: string | null
          province?: string | null
          relationship?: string | null
          requires_adherents?: boolean
          sale_id: string
          signature_link_id?: string | null
          signature_required?: boolean | null
          source_addendum_id?: string | null
          source_incorporation_id?: string | null
          status?: string
        }
        Update: {
          activated_at?: string | null
          address?: string | null
          amount?: number | null
          barrio?: string | null
          birth_date?: string | null
          city?: string | null
          coverage_end_date?: string | null
          coverage_start_date?: string | null
          created_at?: string | null
          dni?: string | null
          document_number?: string | null
          document_type?: string | null
          email?: string | null
          entry_date?: string | null
          first_name?: string
          gender?: string | null
          has_preexisting_conditions?: boolean | null
          id?: string
          immediate_coverage?: boolean | null
          is_primary?: boolean | null
          last_name?: string
          marital_status?: string | null
          maternity_bonus?: boolean
          member_role?: string
          occupation?: string | null
          parent_beneficiary_id?: string | null
          phone?: string | null
          plan_id?: string | null
          postal_code?: string | null
          preexisting_conditions_detail?: string | null
          province?: string | null
          relationship?: string | null
          requires_adherents?: boolean
          sale_id?: string
          signature_link_id?: string | null
          signature_required?: boolean | null
          source_addendum_id?: string | null
          source_incorporation_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "beneficiaries_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beneficiaries_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beneficiaries_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beneficiaries_source_addendum_id_fkey"
            columns: ["source_addendum_id"]
            isOneToOne: false
            referencedRelation: "sale_addendums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_beneficiaries_parent"
            columns: ["parent_beneficiary_id", "sale_id"]
            isOneToOne: false
            referencedRelation: "beneficiaries"
            referencedColumns: ["id", "sale_id"]
          },
          {
            foreignKeyName: "fk_beneficiaries_plan"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      beneficiary_documents: {
        Row: {
          beneficiary_id: string
          created_at: string | null
          document_type_id: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          is_verified: boolean | null
          upload_source: string | null
          uploaded_by: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          beneficiary_id: string
          created_at?: string | null
          document_type_id?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          is_verified?: boolean | null
          upload_source?: string | null
          uploaded_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          beneficiary_id?: string
          created_at?: string | null
          document_type_id?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          is_verified?: boolean | null
          upload_source?: string | null
          uploaded_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "beneficiary_documents_beneficiary_id_fkey"
            columns: ["beneficiary_id"]
            isOneToOne: false
            referencedRelation: "beneficiaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beneficiary_documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          barrio: string | null
          birth_date: string | null
          city: string | null
          client_type: string
          company_id: string
          country_id: string | null
          created_at: string | null
          dni: string | null
          email: string | null
          external_id: string | null
          first_name: string
          gender: string | null
          hr_contact_email: string | null
          hr_contact_name: string | null
          hr_contact_phone: string | null
          id: string
          is_active: boolean | null
          last_name: string
          marital_status: string | null
          notes: string | null
          phone: string | null
          postal_code: string | null
          province: string | null
          razon_social: string | null
          ruc: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          barrio?: string | null
          birth_date?: string | null
          city?: string | null
          client_type?: string
          company_id: string
          country_id?: string | null
          created_at?: string | null
          dni?: string | null
          email?: string | null
          external_id?: string | null
          first_name: string
          gender?: string | null
          hr_contact_email?: string | null
          hr_contact_name?: string | null
          hr_contact_phone?: string | null
          id?: string
          is_active?: boolean | null
          last_name: string
          marital_status?: string | null
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          razon_social?: string | null
          ruc?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          barrio?: string | null
          birth_date?: string | null
          city?: string | null
          client_type?: string
          company_id?: string
          country_id?: string | null
          created_at?: string | null
          dni?: string | null
          email?: string | null
          external_id?: string | null
          first_name?: string
          gender?: string | null
          hr_contact_email?: string | null
          hr_contact_name?: string | null
          hr_contact_phone?: string | null
          id?: string
          is_active?: boolean | null
          last_name?: string
          marital_status?: string | null
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          razon_social?: string | null
          ruc?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_admin_fees: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          sale_type: string
          updated_at: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          sale_type: string
          updated_at?: string
          valid_from: string
          valid_to?: string | null
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          sale_type?: string
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_admin_fees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_items: {
        Row: {
          base_amount: number
          client_display_id: string
          client_name: string
          client_sequence: number | null
          commission_amount: number
          company_id: string
          concept: string
          created_at: string
          group_type: string | null
          id: string
          is_settled: boolean
          item_number: number
          percent: number | null
          period_id: string
          plan_name: string
          rule_id: string | null
          rule_snapshot: Json
          sale_date: string
          sale_id: string
          sale_type: string | null
          salesperson_id: string
        }
        Insert: {
          base_amount: number
          client_display_id: string
          client_name: string
          client_sequence?: number | null
          commission_amount: number
          company_id: string
          concept?: string
          created_at?: string
          group_type?: string | null
          id?: string
          is_settled?: boolean
          item_number: number
          percent?: number | null
          period_id: string
          plan_name: string
          rule_id?: string | null
          rule_snapshot: Json
          sale_date: string
          sale_id: string
          sale_type?: string | null
          salesperson_id: string
        }
        Update: {
          base_amount?: number
          client_display_id?: string
          client_name?: string
          client_sequence?: number | null
          commission_amount?: number
          company_id?: string
          concept?: string
          created_at?: string
          group_type?: string | null
          id?: string
          is_settled?: boolean
          item_number?: number
          percent?: number | null
          period_id?: string
          plan_name?: string
          rule_id?: string | null
          rule_snapshot?: Json
          sale_date?: string
          sale_id?: string
          sale_type?: string | null
          salesperson_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_items_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "commission_period_payable"
            referencedColumns: ["period_id"]
          },
          {
            foreignKeyName: "commission_items_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "commission_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_items_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "commission_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_items_salesperson_id_fkey"
            columns: ["salesperson_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_period_adjustments: {
        Row: {
          amount: number
          base_amount: number | null
          calc_mode: string
          company_id: string
          concept: string
          created_at: string
          created_by: string
          id: string
          item_id: string | null
          notes: string | null
          percent: number | null
          period_id: string
          sign: number
        }
        Insert: {
          amount: number
          base_amount?: number | null
          calc_mode: string
          company_id: string
          concept: string
          created_at?: string
          created_by: string
          id?: string
          item_id?: string | null
          notes?: string | null
          percent?: number | null
          period_id: string
          sign: number
        }
        Update: {
          amount?: number
          base_amount?: number | null
          calc_mode?: string
          company_id?: string
          concept?: string
          created_at?: string
          created_by?: string
          id?: string
          item_id?: string | null
          notes?: string | null
          percent?: number | null
          period_id?: string
          sign?: number
        }
        Relationships: [
          {
            foreignKeyName: "commission_period_adjustments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_period_adjustments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "commission_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_period_adjustments_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "commission_period_payable"
            referencedColumns: ["period_id"]
          },
          {
            foreignKeyName: "commission_period_adjustments_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "commission_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_periods: {
        Row: {
          annulled_at: string | null
          annulled_by: string | null
          annulment_reason: string | null
          closed_at: string | null
          closed_by: string | null
          company_id: string
          concept: string
          created_at: string
          created_by: string
          currency_code: string
          id: string
          liquidation_number: string
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          period_end: string
          period_start: string
          salesperson_email: string | null
          salesperson_id: string
          salesperson_name: string
          status: string
          total_amount: number
        }
        Insert: {
          annulled_at?: string | null
          annulled_by?: string | null
          annulment_reason?: string | null
          closed_at?: string | null
          closed_by?: string | null
          company_id: string
          concept?: string
          created_at?: string
          created_by: string
          currency_code?: string
          id?: string
          liquidation_number: string
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          period_end: string
          period_start: string
          salesperson_email?: string | null
          salesperson_id: string
          salesperson_name: string
          status?: string
          total_amount?: number
        }
        Update: {
          annulled_at?: string | null
          annulled_by?: string | null
          annulment_reason?: string | null
          closed_at?: string | null
          closed_by?: string | null
          company_id?: string
          concept?: string
          created_at?: string
          created_by?: string
          currency_code?: string
          id?: string
          liquidation_number?: string
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          period_end?: string
          period_start?: string
          salesperson_email?: string | null
          salesperson_id?: string
          salesperson_name?: string
          status?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "commission_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_periods_salesperson_id_fkey"
            columns: ["salesperson_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_plan_settings: {
        Row: {
          company_id: string
          created_at: string
          group_type: string
          id: string
          is_active: boolean
          plan_id: string
          report_code: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          group_type: string
          id?: string
          is_active?: boolean
          plan_id: string
          report_code?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          group_type?: string
          id?: string
          is_active?: boolean
          plan_id?: string
          report_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_plan_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_plan_settings_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          base: string
          calc_mode: string
          company_id: string
          created_at: string
          created_by: string | null
          fixed_amount: number | null
          group_type: string | null
          id: string
          is_active: boolean
          percent: number | null
          plan_id: string | null
          priority: number
          sale_type: string | null
          salesperson_id: string | null
          specificity: number | null
          updated_at: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          base: string
          calc_mode: string
          company_id: string
          created_at?: string
          created_by?: string | null
          fixed_amount?: number | null
          group_type?: string | null
          id?: string
          is_active?: boolean
          percent?: number | null
          plan_id?: string | null
          priority?: number
          sale_type?: string | null
          salesperson_id?: string | null
          specificity?: number | null
          updated_at?: string
          valid_from: string
          valid_to?: string | null
        }
        Update: {
          base?: string
          calc_mode?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          fixed_amount?: number | null
          group_type?: string | null
          id?: string
          is_active?: boolean
          percent?: number | null
          plan_id?: string | null
          priority?: number
          sale_type?: string | null
          salesperson_id?: string | null
          specificity?: number | null
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_salesperson_id_fkey"
            columns: ["salesperson_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_salespeople: {
        Row: {
          company_id: string
          created_at: string
          default_base: string
          default_percent: number | null
          id: string
          is_active: boolean
          salesperson_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          default_base?: string
          default_percent?: number | null
          id?: string
          is_active?: boolean
          salesperson_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          default_base?: string
          default_percent?: number | null
          id?: string
          is_active?: boolean
          salesperson_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_salespeople_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_salespeople_salesperson_id_fkey"
            columns: ["salesperson_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_settings: {
        Row: {
          accrual_event: string
          company_id: string
          created_at: string
          is_enabled: boolean
          liquidation_prefix: string
          maternity_extra_amount: number | null
          next_liquidation_number: number
          tax_divisor: number
          updated_at: string
        }
        Insert: {
          accrual_event?: string
          company_id: string
          created_at?: string
          is_enabled?: boolean
          liquidation_prefix?: string
          maternity_extra_amount?: number | null
          next_liquidation_number?: number
          tax_divisor?: number
          updated_at?: string
        }
        Update: {
          accrual_event?: string
          company_id?: string
          created_at?: string
          is_enabled?: boolean
          liquidation_prefix?: string
          maternity_extra_amount?: number | null
          next_liquidation_number?: number
          tax_divisor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_logs: {
        Row: {
          channel: string
          client_id: string | null
          company_id: string
          content: string | null
          created_at: string | null
          direction: string | null
          id: string
          sale_id: string | null
          sent_at: string | null
          status: string | null
          subject: string | null
        }
        Insert: {
          channel: string
          client_id?: string | null
          company_id: string
          content?: string | null
          created_at?: string | null
          direction?: string | null
          id?: string
          sale_id?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
        }
        Update: {
          channel?: string
          client_id?: string | null
          company_id?: string
          content?: string | null
          created_at?: string | null
          direction?: string | null
          id?: string
          sale_id?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_logs_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_logs_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_logs_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          accent_color: string | null
          address: string | null
          border_radius: string | null
          created_at: string | null
          custom_css: string | null
          dark_mode: boolean | null
          email: string | null
          favicon: string | null
          font_family: string | null
          id: string
          is_active: boolean | null
          login_background_url: string | null
          login_logo_url: string | null
          logo_url: string | null
          name: string
          phone: string | null
          primary_color: string | null
          secondary_color: string | null
          shadows: boolean | null
          tax_id: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          accent_color?: string | null
          address?: string | null
          border_radius?: string | null
          created_at?: string | null
          custom_css?: string | null
          dark_mode?: boolean | null
          email?: string | null
          favicon?: string | null
          font_family?: string | null
          id?: string
          is_active?: boolean | null
          login_background_url?: string | null
          login_logo_url?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          shadows?: boolean | null
          tax_id?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          accent_color?: string | null
          address?: string | null
          border_radius?: string | null
          created_at?: string | null
          custom_css?: string | null
          dark_mode?: boolean | null
          email?: string | null
          favicon?: string | null
          font_family?: string | null
          id?: string
          is_active?: boolean | null
          login_background_url?: string | null
          login_logo_url?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          shadows?: boolean | null
          tax_id?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      company_currency_settings: {
        Row: {
          company_id: string
          created_at: string | null
          currency_code: string | null
          currency_symbol: string | null
          decimal_places: number | null
          decimal_separator: string | null
          id: string
          thousand_separator: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          currency_code?: string | null
          currency_symbol?: string | null
          decimal_places?: number | null
          decimal_separator?: string | null
          id?: string
          thousand_separator?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          currency_code?: string | null
          currency_symbol?: string | null
          decimal_places?: number | null
          decimal_separator?: string | null
          id?: string
          thousand_separator?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_currency_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_otp_policy: {
        Row: {
          allowed_channels: Json
          company_id: string
          created_at: string | null
          default_channel: string
          id: string
          max_attempts: number
          otp_expiration_seconds: number
          otp_length: number
          otp_use_signature_whatsapp: boolean | null
          otp_whatsapp_gateway_url: string | null
          otp_whatsapp_provider: string | null
          require_otp_for_signature: boolean
          smtp_from_address: string | null
          smtp_from_name: string | null
          smtp_host: string | null
          smtp_password_encrypted: string | null
          smtp_port: number | null
          smtp_relay_url: string | null
          smtp_tls: boolean | null
          smtp_user: string | null
          updated_at: string | null
          whatsapp_otp_enabled: boolean
        }
        Insert: {
          allowed_channels?: Json
          company_id: string
          created_at?: string | null
          default_channel?: string
          id?: string
          max_attempts?: number
          otp_expiration_seconds?: number
          otp_length?: number
          otp_use_signature_whatsapp?: boolean | null
          otp_whatsapp_gateway_url?: string | null
          otp_whatsapp_provider?: string | null
          require_otp_for_signature?: boolean
          smtp_from_address?: string | null
          smtp_from_name?: string | null
          smtp_host?: string | null
          smtp_password_encrypted?: string | null
          smtp_port?: number | null
          smtp_relay_url?: string | null
          smtp_tls?: boolean | null
          smtp_user?: string | null
          updated_at?: string | null
          whatsapp_otp_enabled?: boolean
        }
        Update: {
          allowed_channels?: Json
          company_id?: string
          created_at?: string | null
          default_channel?: string
          id?: string
          max_attempts?: number
          otp_expiration_seconds?: number
          otp_length?: number
          otp_use_signature_whatsapp?: boolean | null
          otp_whatsapp_gateway_url?: string | null
          otp_whatsapp_provider?: string | null
          require_otp_for_signature?: boolean
          smtp_from_address?: string | null
          smtp_from_name?: string | null
          smtp_host?: string | null
          smtp_password_encrypted?: string | null
          smtp_port?: number | null
          smtp_relay_url?: string | null
          smtp_tls?: boolean | null
          smtp_user?: string | null
          updated_at?: string | null
          whatsapp_otp_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "company_otp_policy_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          company_id: string
          contratada_auto_whatsapp: boolean
          contratada_signature_mode: string
          contratada_signer_dni: string | null
          contratada_signer_email: string | null
          contratada_signer_name: string | null
          contratada_signer_phone: string | null
          created_at: string | null
          email_api_key: string | null
          email_from_address: string | null
          email_from_name: string | null
          email_provider: string | null
          id: string
          menu_config: Json | null
          pdf_footer_base64: string | null
          pdf_footer_image_url: string | null
          pdf_header_image_url: string | null
          pdf_logo_base64: string | null
          pdf_tagline_base64: string | null
          signature_block_style: Json | null
          signwell_api_key: string | null
          signwell_enabled: boolean | null
          sms_api_key: string | null
          sms_sender_id: string | null
          twilio_account_sid: string | null
          twilio_auth_token: string | null
          twilio_whatsapp_number: string | null
          updated_at: string | null
          whatsapp_api_key: string | null
          whatsapp_gateway_url: string | null
          whatsapp_linked_phone: string | null
          whatsapp_phone_id: string | null
          whatsapp_provider: string
        }
        Insert: {
          company_id: string
          contratada_auto_whatsapp?: boolean
          contratada_signature_mode?: string
          contratada_signer_dni?: string | null
          contratada_signer_email?: string | null
          contratada_signer_name?: string | null
          contratada_signer_phone?: string | null
          created_at?: string | null
          email_api_key?: string | null
          email_from_address?: string | null
          email_from_name?: string | null
          email_provider?: string | null
          id?: string
          menu_config?: Json | null
          pdf_footer_base64?: string | null
          pdf_footer_image_url?: string | null
          pdf_header_image_url?: string | null
          pdf_logo_base64?: string | null
          pdf_tagline_base64?: string | null
          signature_block_style?: Json | null
          signwell_api_key?: string | null
          signwell_enabled?: boolean | null
          sms_api_key?: string | null
          sms_sender_id?: string | null
          twilio_account_sid?: string | null
          twilio_auth_token?: string | null
          twilio_whatsapp_number?: string | null
          updated_at?: string | null
          whatsapp_api_key?: string | null
          whatsapp_gateway_url?: string | null
          whatsapp_linked_phone?: string | null
          whatsapp_phone_id?: string | null
          whatsapp_provider?: string
        }
        Update: {
          company_id?: string
          contratada_auto_whatsapp?: boolean
          contratada_signature_mode?: string
          contratada_signer_dni?: string | null
          contratada_signer_email?: string | null
          contratada_signer_name?: string | null
          contratada_signer_phone?: string | null
          created_at?: string | null
          email_api_key?: string | null
          email_from_address?: string | null
          email_from_name?: string | null
          email_provider?: string | null
          id?: string
          menu_config?: Json | null
          pdf_footer_base64?: string | null
          pdf_footer_image_url?: string | null
          pdf_header_image_url?: string | null
          pdf_logo_base64?: string | null
          pdf_tagline_base64?: string | null
          signature_block_style?: Json | null
          signwell_api_key?: string | null
          signwell_enabled?: boolean | null
          sms_api_key?: string | null
          sms_sender_id?: string | null
          twilio_account_sid?: string | null
          twilio_auth_token?: string | null
          twilio_whatsapp_number?: string | null
          updated_at?: string | null
          whatsapp_api_key?: string | null
          whatsapp_gateway_url?: string | null
          whatsapp_linked_phone?: string | null
          whatsapp_phone_id?: string | null
          whatsapp_provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_ui_settings: {
        Row: {
          analytics_config: Json | null
          company_id: string
          created_at: string | null
          dashboard_layout: Json | null
          id: string
          sale_progress_config: Json | null
          sidebar_collapsed: boolean | null
          theme: string | null
          updated_at: string | null
        }
        Insert: {
          analytics_config?: Json | null
          company_id: string
          created_at?: string | null
          dashboard_layout?: Json | null
          id?: string
          sale_progress_config?: Json | null
          sidebar_collapsed?: boolean | null
          theme?: string | null
          updated_at?: string | null
        }
        Update: {
          analytics_config?: Json | null
          company_id?: string
          created_at?: string | null
          dashboard_layout?: Json | null
          id?: string
          sale_progress_config?: Json | null
          sidebar_collapsed?: boolean | null
          theme?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_ui_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_workflow_config: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          is_active: boolean
          updated_at: string | null
          updated_by: string | null
          workflow_config: Json
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string | null
          updated_by?: string | null
          workflow_config?: Json
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string | null
          updated_by?: string | null
          workflow_config?: Json
        }
        Relationships: [
          {
            foreignKeyName: "company_workflow_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          code: string
          created_at: string | null
          id: string
          name: string
          phone_code: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          name: string
          phone_code?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          name?: string
          phone_code?: string | null
        }
        Relationships: []
      }
      dashboard_widgets: {
        Row: {
          config: Json | null
          created_at: string | null
          id: string
          is_visible: boolean | null
          position: number | null
          updated_at: string | null
          user_id: string
          widget_type: string
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          id?: string
          is_visible?: boolean | null
          position?: number | null
          updated_at?: string | null
          user_id: string
          widget_type: string
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          id?: string
          is_visible?: boolean | null
          position?: number | null
          updated_at?: string | null
          user_id?: string
          widget_type?: string
        }
        Relationships: []
      }
      document_access_logs: {
        Row: {
          access_type: string | null
          created_at: string | null
          document_id: string
          id: string
          ip_address: string | null
          user_id: string | null
        }
        Insert: {
          access_type?: string | null
          created_at?: string | null
          document_id: string
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Update: {
          access_type?: string | null
          created_at?: string | null
          document_id?: string
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_access_logs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_field_values: {
        Row: {
          completed_at: string | null
          created_at: string
          field_id: string
          id: string
          signature_link_id: string
          value_json: Json | null
          value_text: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          field_id: string
          id?: string
          signature_link_id: string
          value_json?: Json | null
          value_text?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          field_id?: string
          id?: string
          signature_link_id?: string
          value_json?: Json | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_field_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "document_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_field_values_signature_link_id_fkey"
            columns: ["signature_link_id"]
            isOneToOne: false
            referencedRelation: "signature_links"
            referencedColumns: ["id"]
          },
        ]
      }
      document_fields: {
        Row: {
          created_at: string
          document_id: string
          field_type: string
          h: number
          id: string
          label: string | null
          meta: Json
          page: number
          required: boolean
          signer_role: string
          w: number
          x: number
          y: number
        }
        Insert: {
          created_at?: string
          document_id: string
          field_type: string
          h: number
          id?: string
          label?: string | null
          meta?: Json
          page?: number
          required?: boolean
          signer_role: string
          w: number
          x: number
          y: number
        }
        Update: {
          created_at?: string
          document_id?: string
          field_type?: string
          h?: number
          id?: string
          label?: string | null
          meta?: Json
          page?: number
          required?: boolean
          signer_role?: string
          w?: number
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_fields_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_package_items: {
        Row: {
          created_at: string | null
          document_id: string
          id: string
          is_required: boolean | null
          package_id: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          document_id: string
          id?: string
          is_required?: boolean | null
          package_id: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          document_id?: string
          id?: string
          is_required?: boolean | null
          package_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_package_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_package_items_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "document_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      document_packages: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          package_type: string | null
          sale_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          package_type?: string | null
          sale_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          package_type?: string | null
          sale_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_packages_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_packages_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_packages_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
        ]
      }
      document_print_versions: {
        Row: {
          created_at: string | null
          document_id: string
          generated_by: string | null
          id: string
          is_current: boolean
          pdf_hash: string | null
          pdf_url: string
          reason: string | null
          sale_id: string
          version_number: number
        }
        Insert: {
          created_at?: string | null
          document_id: string
          generated_by?: string | null
          id?: string
          is_current?: boolean
          pdf_hash?: string | null
          pdf_url: string
          reason?: string | null
          sale_id: string
          version_number: number
        }
        Update: {
          created_at?: string | null
          document_id?: string
          generated_by?: string | null
          id?: string
          is_current?: boolean
          pdf_hash?: string | null
          pdf_url?: string
          reason?: string | null
          sale_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_print_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_print_versions_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_print_versions_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_print_versions_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
        ]
      }
      document_types: {
        Row: {
          applies_to: string | null
          code: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_required: boolean | null
          name: string
          requires_signature: boolean | null
          sort_order: number | null
          template_id: string | null
          updated_at: string | null
        }
        Insert: {
          applies_to?: string | null
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          name: string
          requires_signature?: boolean | null
          sort_order?: number | null
          template_id?: string | null
          updated_at?: string | null
        }
        Update: {
          applies_to?: string | null
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          name?: string
          requires_signature?: boolean | null
          sort_order?: number | null
          template_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_types_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          base_pdf_hash: string | null
          base_pdf_url: string | null
          beneficiary_id: string | null
          content: string | null
          created_at: string | null
          document_type: string | null
          document_type_id: string | null
          evidence_certificate_hash: string | null
          evidence_certificate_url: string | null
          file_url: string | null
          generated_from_template: boolean | null
          id: string
          is_final: boolean | null
          latest_print_pdf_at: string | null
          latest_print_pdf_url: string | null
          name: string
          requires_signature: boolean | null
          sale_id: string
          signature_data: string | null
          signed_at: string | null
          signed_by: string | null
          signed_pdf_hash: string | null
          signed_pdf_url: string | null
          status: Database["public"]["Enums"]["document_status"] | null
          template_designer_version: string | null
          template_version_id: string | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          base_pdf_hash?: string | null
          base_pdf_url?: string | null
          beneficiary_id?: string | null
          content?: string | null
          created_at?: string | null
          document_type?: string | null
          document_type_id?: string | null
          evidence_certificate_hash?: string | null
          evidence_certificate_url?: string | null
          file_url?: string | null
          generated_from_template?: boolean | null
          id?: string
          is_final?: boolean | null
          latest_print_pdf_at?: string | null
          latest_print_pdf_url?: string | null
          name: string
          requires_signature?: boolean | null
          sale_id: string
          signature_data?: string | null
          signed_at?: string | null
          signed_by?: string | null
          signed_pdf_hash?: string | null
          signed_pdf_url?: string | null
          status?: Database["public"]["Enums"]["document_status"] | null
          template_designer_version?: string | null
          template_version_id?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          base_pdf_hash?: string | null
          base_pdf_url?: string | null
          beneficiary_id?: string | null
          content?: string | null
          created_at?: string | null
          document_type?: string | null
          document_type_id?: string | null
          evidence_certificate_hash?: string | null
          evidence_certificate_url?: string | null
          file_url?: string | null
          generated_from_template?: boolean | null
          id?: string
          is_final?: boolean | null
          latest_print_pdf_at?: string | null
          latest_print_pdf_url?: string | null
          name?: string
          requires_signature?: boolean | null
          sale_id?: string
          signature_data?: string | null
          signed_at?: string | null
          signed_by?: string | null
          signed_pdf_hash?: string | null
          signed_pdf_url?: string | null
          status?: Database["public"]["Enums"]["document_status"] | null
          template_designer_version?: string | null
          template_version_id?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_beneficiary_id_fkey"
            columns: ["beneficiary_id"]
            isOneToOne: false
            referencedRelation: "beneficiaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          clicked_count: number | null
          company_id: string
          created_at: string | null
          id: string
          name: string
          opened_count: number | null
          scheduled_at: string | null
          sent_at: string | null
          sent_count: number | null
          status: string | null
          subject: string | null
          template_id: string | null
        }
        Insert: {
          clicked_count?: number | null
          company_id: string
          created_at?: string | null
          id?: string
          name: string
          opened_count?: number | null
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number | null
          status?: string | null
          subject?: string | null
          template_id?: string | null
        }
        Update: {
          clicked_count?: number | null
          company_id?: string
          created_at?: string | null
          id?: string
          name?: string
          opened_count?: number | null
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number | null
          status?: string | null
          subject?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body: string
          channel: string
          company_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          subject: string
          template_key: string | null
          updated_at: string | null
        }
        Insert: {
          body: string
          channel?: string
          company_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          subject: string
          template_key?: string | null
          updated_at?: string | null
        }
        Update: {
          body?: string
          channel?: string
          company_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          subject?: string
          template_key?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      file_uploads: {
        Row: {
          company_id: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          uploaded_by: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_uploads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      hash_anchors: {
        Row: {
          anchor_reference: string | null
          anchor_type: string
          anchored_at: string | null
          created_at: string | null
          evidence_bundle_id: string
          hash_value: string
          id: string
        }
        Insert: {
          anchor_reference?: string | null
          anchor_type?: string
          anchored_at?: string | null
          created_at?: string | null
          evidence_bundle_id: string
          hash_value: string
          id?: string
        }
        Update: {
          anchor_reference?: string | null
          anchor_type?: string
          anchored_at?: string | null
          created_at?: string | null
          evidence_bundle_id?: string
          hash_value?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hash_anchors_evidence_bundle_id_fkey"
            columns: ["evidence_bundle_id"]
            isOneToOne: false
            referencedRelation: "signature_evidence_bundles"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_attachments: {
        Row: {
          created_at: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          incident_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          incident_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          incident_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incident_attachments_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_comments: {
        Row: {
          author_id: string | null
          content: string
          created_at: string | null
          id: string
          incident_id: string
          is_internal: boolean | null
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          incident_id: string
          is_internal?: boolean | null
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          incident_id?: string
          is_internal?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "incident_comments_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          analysis_notes: string | null
          assigned_to: string | null
          company_id: string | null
          created_at: string | null
          description: string
          development_ended_at: string | null
          development_started_at: string | null
          estimated_hours: number | null
          id: string
          module: string
          priority: string
          reported_by: string | null
          resolution_notes: string | null
          resolved_at: string | null
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          analysis_notes?: string | null
          assigned_to?: string | null
          company_id?: string | null
          created_at?: string | null
          description: string
          development_ended_at?: string | null
          development_started_at?: string | null
          estimated_hours?: number | null
          id?: string
          module: string
          priority?: string
          reported_by?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          analysis_notes?: string | null
          assigned_to?: string | null
          company_id?: string | null
          created_at?: string | null
          description?: string
          development_ended_at?: string | null
          development_started_at?: string | null
          estimated_hours?: number | null
          id?: string
          module?: string
          priority?: string
          reported_by?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incidents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      information_requests: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          request_type: string
          requested_by: string | null
          responded_at: string | null
          response: string | null
          sale_id: string
          status: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          request_type: string
          requested_by?: string | null
          responded_at?: string | null
          response?: string | null
          sale_id: string
          status?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          request_type?: string
          requested_by?: string | null
          responded_at?: string | null
          response?: string | null
          sale_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "information_requests_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "information_requests_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "information_requests_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_evidence_certificates: {
        Row: {
          certificate_hash: string | null
          certificate_url: string | null
          created_at: string
          document_id: string | null
          id: string
          payload: Json
          sale_id: string
          signature_link_id: string | null
        }
        Insert: {
          certificate_hash?: string | null
          certificate_url?: string | null
          created_at?: string
          document_id?: string | null
          id?: string
          payload?: Json
          sale_id: string
          signature_link_id?: string | null
        }
        Update: {
          certificate_hash?: string | null
          certificate_url?: string | null
          created_at?: string
          document_id?: string | null
          id?: string
          payload?: Json
          sale_id?: string
          signature_link_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_evidence_certificates_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_evidence_certificates_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_evidence_certificates_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_evidence_certificates_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_evidence_certificates_signature_link_id_fkey"
            columns: ["signature_link_id"]
            isOneToOne: false
            referencedRelation: "signature_links"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          link: string | null
          message: string | null
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message?: string | null
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message?: string | null
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      password_reset_tokens: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          token: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          token: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          token?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      plan_changes: {
        Row: {
          client_id: string
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          document_id: string | null
          id: string
          members_snapshot: Json
          new_contract_start_date: string | null
          new_plan_id: string | null
          new_total_amount: number | null
          notes: string | null
          observations: string | null
          operation_sale_id: string
          parent_sale_id: string | null
          previous_plan_id: string | null
          previous_total_amount: number | null
          reason: string
          signature_link_id: string | null
          source: string
          status: string
          titular_document: string | null
          titular_name: string
          updated_at: string
        }
        Insert: {
          client_id: string
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          id?: string
          members_snapshot?: Json
          new_contract_start_date?: string | null
          new_plan_id?: string | null
          new_total_amount?: number | null
          notes?: string | null
          observations?: string | null
          operation_sale_id: string
          parent_sale_id?: string | null
          previous_plan_id?: string | null
          previous_total_amount?: number | null
          reason: string
          signature_link_id?: string | null
          source?: string
          status?: string
          titular_document?: string | null
          titular_name: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          id?: string
          members_snapshot?: Json
          new_contract_start_date?: string | null
          new_plan_id?: string | null
          new_total_amount?: number | null
          notes?: string | null
          observations?: string | null
          operation_sale_id?: string
          parent_sale_id?: string | null
          previous_plan_id?: string | null
          previous_total_amount?: number | null
          reason?: string
          signature_link_id?: string | null
          source?: string
          status?: string
          titular_document?: string | null
          titular_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_changes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_changes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_changes_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_changes_new_plan_id_fkey"
            columns: ["new_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_changes_operation_sale_id_fkey"
            columns: ["operation_sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_changes_operation_sale_id_fkey"
            columns: ["operation_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_changes_operation_sale_id_fkey"
            columns: ["operation_sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_changes_parent_sale_id_fkey"
            columns: ["parent_sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_changes_parent_sale_id_fkey"
            columns: ["parent_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_changes_parent_sale_id_fkey"
            columns: ["parent_sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_changes_previous_plan_id_fkey"
            columns: ["previous_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_changes_signature_link_id_fkey"
            columns: ["signature_link_id"]
            isOneToOne: false
            referencedRelation: "signature_links"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          company_id: string
          coverage_details: Json | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          price: number
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          coverage_details?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          price?: number
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          coverage_details?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          price?: number
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plans_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      process_traces: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          sale_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          sale_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          sale_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_traces_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_traces_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_traces_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          created_at: string | null
          email: string | null
          first_name: string | null
          id: string
          is_active: boolean | null
          last_name: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id: string
          is_active?: boolean | null
          last_name?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_active?: boolean | null
          last_name?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_log: {
        Row: {
          count: number
          id: number
          key: string
          updated_at: string
          window_start: string
        }
        Insert: {
          count?: number
          id?: number
          key: string
          updated_at?: string
          window_start: string
        }
        Update: {
          count?: number
          id?: number
          key?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      sale_addendum_beneficiaries: {
        Row: {
          activated_at: string | null
          addendum_id: string
          address: string | null
          amount: number | null
          barrio: string | null
          beneficiary_id: string | null
          birth_date: string | null
          city: string | null
          created_at: string
          dni: string | null
          document_number: string | null
          document_type: string | null
          email: string | null
          first_name: string
          has_preexisting_conditions: boolean
          id: string
          last_name: string
          phone: string | null
          preexisting_conditions_detail: string | null
          province: string | null
          relationship: string | null
          signature_required: boolean
          status: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          addendum_id: string
          address?: string | null
          amount?: number | null
          barrio?: string | null
          beneficiary_id?: string | null
          birth_date?: string | null
          city?: string | null
          created_at?: string
          dni?: string | null
          document_number?: string | null
          document_type?: string | null
          email?: string | null
          first_name: string
          has_preexisting_conditions?: boolean
          id?: string
          last_name: string
          phone?: string | null
          preexisting_conditions_detail?: string | null
          province?: string | null
          relationship?: string | null
          signature_required?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          addendum_id?: string
          address?: string | null
          amount?: number | null
          barrio?: string | null
          beneficiary_id?: string | null
          birth_date?: string | null
          city?: string | null
          created_at?: string
          dni?: string | null
          document_number?: string | null
          document_type?: string | null
          email?: string | null
          first_name?: string
          has_preexisting_conditions?: boolean
          id?: string
          last_name?: string
          phone?: string | null
          preexisting_conditions_detail?: string | null
          province?: string | null
          relationship?: string | null
          signature_required?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_addendum_beneficiaries_addendum_id_fkey"
            columns: ["addendum_id"]
            isOneToOne: false
            referencedRelation: "sale_addendums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_addendum_beneficiaries_beneficiary_id_fkey"
            columns: ["beneficiary_id"]
            isOneToOne: false
            referencedRelation: "beneficiaries"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_addendums: {
        Row: {
          audit_notes: string | null
          audited_at: string | null
          audited_by: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          id: string
          parent_sale_id: string
          requested_by: string | null
          status: string
          submitted_at: string | null
          type: string
          updated_at: string
        }
        Insert: {
          audit_notes?: string | null
          audited_at?: string | null
          audited_by?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          parent_sale_id: string
          requested_by?: string | null
          status?: string
          submitted_at?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          audit_notes?: string | null
          audited_at?: string | null
          audited_by?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          parent_sale_id?: string
          requested_by?: string | null
          status?: string
          submitted_at?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_addendums_audited_by_fkey"
            columns: ["audited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_addendums_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_addendums_parent_sale_id_fkey"
            columns: ["parent_sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_addendums_parent_sale_id_fkey"
            columns: ["parent_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_addendums_parent_sale_id_fkey"
            columns: ["parent_sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_addendums_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_documents: {
        Row: {
          created_at: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          sale_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          sale_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          sale_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_documents_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_documents_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_documents_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_notes: {
        Row: {
          created_at: string | null
          id: string
          is_internal: boolean | null
          note_text: string
          sale_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_internal?: boolean | null
          note_text: string
          sale_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_internal?: boolean | null
          note_text?: string
          sale_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_notes_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_notes_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_notes_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_requirements: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          id: string
          is_completed: boolean | null
          requirement_text: string
          sale_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          requirement_text: string
          sale_id: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          requirement_text?: string
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_requirements_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_requirements_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_requirements_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_templates: {
        Row: {
          created_at: string | null
          id: string
          sale_id: string
          template_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          sale_id: string
          template_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          sale_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_templates_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_templates_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_templates_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_templates_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_workflow_states: {
        Row: {
          change_reason: string | null
          changed_by: string | null
          created_at: string | null
          id: string
          metadata: Json | null
          new_status: string
          previous_status: string | null
          sale_id: string
        }
        Insert: {
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          new_status: string
          previous_status?: string | null
          sale_id: string
        }
        Update: {
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          new_status?: string
          previous_status?: string | null
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_workflow_states_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_workflow_states_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_workflow_states_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          adherents_count: number | null
          all_signatures_completed: boolean | null
          audit_notes: string | null
          audit_status: string | null
          audited_at: string | null
          auditor_id: string | null
          billing_email: string | null
          billing_phone: string | null
          billing_razon_social: string | null
          billing_ruc: string | null
          client_id: string | null
          company_id: string
          contract_completed_at: string | null
          contract_end_date: string | null
          contract_number: string | null
          contract_pdf_url: string | null
          contract_start_date: string | null
          created_at: string | null
          employee_signature_mode: string
          id: string
          immediate_coverage: boolean | null
          maternity_bonus: boolean
          notes: string | null
          parent_sale_id: string | null
          plan_id: string | null
          request_number: string | null
          requires_adherents: boolean | null
          sale_date: string | null
          sale_type: string | null
          salesperson_id: string | null
          signature_completed_at: string | null
          signature_expires_at: string | null
          signature_token: string | null
          signed_at: string | null
          signed_ip: string | null
          signer_dni: string | null
          signer_email: string | null
          signer_name: string | null
          signer_phone: string | null
          signer_relationship: string | null
          signer_type: string | null
          status: Database["public"]["Enums"]["sale_status"] | null
          template_id: string | null
          titular_amount: number | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          adherents_count?: number | null
          all_signatures_completed?: boolean | null
          audit_notes?: string | null
          audit_status?: string | null
          audited_at?: string | null
          auditor_id?: string | null
          billing_email?: string | null
          billing_phone?: string | null
          billing_razon_social?: string | null
          billing_ruc?: string | null
          client_id?: string | null
          company_id: string
          contract_completed_at?: string | null
          contract_end_date?: string | null
          contract_number?: string | null
          contract_pdf_url?: string | null
          contract_start_date?: string | null
          created_at?: string | null
          employee_signature_mode?: string
          id?: string
          immediate_coverage?: boolean | null
          maternity_bonus?: boolean
          notes?: string | null
          parent_sale_id?: string | null
          plan_id?: string | null
          request_number?: string | null
          requires_adherents?: boolean | null
          sale_date?: string | null
          sale_type?: string | null
          salesperson_id?: string | null
          signature_completed_at?: string | null
          signature_expires_at?: string | null
          signature_token?: string | null
          signed_at?: string | null
          signed_ip?: string | null
          signer_dni?: string | null
          signer_email?: string | null
          signer_name?: string | null
          signer_phone?: string | null
          signer_relationship?: string | null
          signer_type?: string | null
          status?: Database["public"]["Enums"]["sale_status"] | null
          template_id?: string | null
          titular_amount?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          adherents_count?: number | null
          all_signatures_completed?: boolean | null
          audit_notes?: string | null
          audit_status?: string | null
          audited_at?: string | null
          auditor_id?: string | null
          billing_email?: string | null
          billing_phone?: string | null
          billing_razon_social?: string | null
          billing_ruc?: string | null
          client_id?: string | null
          company_id?: string
          contract_completed_at?: string | null
          contract_end_date?: string | null
          contract_number?: string | null
          contract_pdf_url?: string | null
          contract_start_date?: string | null
          created_at?: string | null
          employee_signature_mode?: string
          id?: string
          immediate_coverage?: boolean | null
          maternity_bonus?: boolean
          notes?: string | null
          parent_sale_id?: string | null
          plan_id?: string | null
          request_number?: string | null
          requires_adherents?: boolean | null
          sale_date?: string | null
          sale_type?: string | null
          salesperson_id?: string | null
          signature_completed_at?: string | null
          signature_expires_at?: string | null
          signature_token?: string | null
          signed_at?: string | null
          signed_ip?: string | null
          signer_dni?: string | null
          signer_email?: string | null
          signer_name?: string | null
          signer_phone?: string | null
          signer_relationship?: string | null
          signer_type?: string | null
          status?: Database["public"]["Enums"]["sale_status"] | null
          template_id?: string | null
          titular_amount?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_sales_salesperson"
            columns: ["salesperson_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_parent_sale_id_fkey"
            columns: ["parent_sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_parent_sale_id_fkey"
            columns: ["parent_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_parent_sale_id_fkey"
            columns: ["parent_sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_consent_records: {
        Row: {
          checkbox_state: boolean
          consent_text: string
          consent_text_version: string
          created_at: string
          document_id: string | null
          id: string
          ip_address: string | null
          sale_id: string
          signature_link_id: string
          user_agent: string | null
        }
        Insert: {
          checkbox_state?: boolean
          consent_text: string
          consent_text_version?: string
          created_at?: string
          document_id?: string | null
          id?: string
          ip_address?: string | null
          sale_id: string
          signature_link_id: string
          user_agent?: string | null
        }
        Update: {
          checkbox_state?: boolean
          consent_text?: string
          consent_text_version?: string
          created_at?: string
          document_id?: string | null
          id?: string
          ip_address?: string | null
          sale_id?: string
          signature_link_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signature_consent_records_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_consent_records_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_consent_records_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_consent_records_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_consent_records_signature_link_id_fkey"
            columns: ["signature_link_id"]
            isOneToOne: false
            referencedRelation: "signature_links"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_events: {
        Row: {
          consent_record_id: string | null
          created_at: string
          document_hash: string | null
          document_id: string | null
          document_version: string | null
          evidence_bundle_hash: string | null
          evidence_bundle_url: string | null
          id: string
          identity_verification_id: string | null
          identity_verified: boolean
          ip_address: string | null
          sale_id: string
          signature_link_id: string
          signature_method: string
          signed_pdf_hash: string | null
          timestamp: string
          user_agent: string | null
        }
        Insert: {
          consent_record_id?: string | null
          created_at?: string
          document_hash?: string | null
          document_id?: string | null
          document_version?: string | null
          evidence_bundle_hash?: string | null
          evidence_bundle_url?: string | null
          id?: string
          identity_verification_id?: string | null
          identity_verified?: boolean
          ip_address?: string | null
          sale_id: string
          signature_link_id: string
          signature_method?: string
          signed_pdf_hash?: string | null
          timestamp?: string
          user_agent?: string | null
        }
        Update: {
          consent_record_id?: string | null
          created_at?: string
          document_hash?: string | null
          document_id?: string | null
          document_version?: string | null
          evidence_bundle_hash?: string | null
          evidence_bundle_url?: string | null
          id?: string
          identity_verification_id?: string | null
          identity_verified?: boolean
          ip_address?: string | null
          sale_id?: string
          signature_link_id?: string
          signature_method?: string
          signed_pdf_hash?: string | null
          timestamp?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signature_events_consent_record_id_fkey"
            columns: ["consent_record_id"]
            isOneToOne: false
            referencedRelation: "signature_consent_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_events_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_events_identity_verification_id_fkey"
            columns: ["identity_verification_id"]
            isOneToOne: false
            referencedRelation: "signature_identity_verification"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_events_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_events_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_events_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_events_signature_link_id_fkey"
            columns: ["signature_link_id"]
            isOneToOne: false
            referencedRelation: "signature_links"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_evidence_bundles: {
        Row: {
          bundle_hash: string
          consent_record_id: string | null
          created_at: string | null
          document_hash: string
          document_id: string | null
          evidence_json: Json
          id: string
          identity_verification_id: string | null
          identity_verified: boolean | null
          ip_address: string | null
          pdf_hash: string | null
          sale_id: string
          signature_event_id: string | null
          signature_link_id: string | null
          signature_method: string | null
          storage_url: string | null
          user_agent: string | null
        }
        Insert: {
          bundle_hash: string
          consent_record_id?: string | null
          created_at?: string | null
          document_hash: string
          document_id?: string | null
          evidence_json: Json
          id?: string
          identity_verification_id?: string | null
          identity_verified?: boolean | null
          ip_address?: string | null
          pdf_hash?: string | null
          sale_id: string
          signature_event_id?: string | null
          signature_link_id?: string | null
          signature_method?: string | null
          storage_url?: string | null
          user_agent?: string | null
        }
        Update: {
          bundle_hash?: string
          consent_record_id?: string | null
          created_at?: string | null
          document_hash?: string
          document_id?: string | null
          evidence_json?: Json
          id?: string
          identity_verification_id?: string | null
          identity_verified?: boolean | null
          ip_address?: string | null
          pdf_hash?: string | null
          sale_id?: string
          signature_event_id?: string | null
          signature_link_id?: string | null
          signature_method?: string | null
          storage_url?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signature_evidence_bundles_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_evidence_bundles_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_evidence_bundles_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_evidence_bundles_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_evidence_bundles_signature_event_id_fkey"
            columns: ["signature_event_id"]
            isOneToOne: false
            referencedRelation: "signature_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_evidence_bundles_signature_link_id_fkey"
            columns: ["signature_link_id"]
            isOneToOne: false
            referencedRelation: "signature_links"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_identity_verification: {
        Row: {
          attempts: number
          auth_method: string
          channel: string | null
          created_at: string
          destination_masked: string | null
          expires_at: string
          id: string
          ip_address: string | null
          max_attempts: number
          otp_code_hash: string
          result: string
          sale_id: string
          signature_link_id: string
          user_agent: string | null
          verified_at: string | null
        }
        Insert: {
          attempts?: number
          auth_method?: string
          channel?: string | null
          created_at?: string
          destination_masked?: string | null
          expires_at: string
          id?: string
          ip_address?: string | null
          max_attempts?: number
          otp_code_hash: string
          result?: string
          sale_id: string
          signature_link_id: string
          user_agent?: string | null
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          auth_method?: string
          channel?: string | null
          created_at?: string
          destination_masked?: string | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          max_attempts?: number
          otp_code_hash?: string
          result?: string
          sale_id?: string
          signature_link_id?: string
          user_agent?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signature_identity_verification_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_identity_verification_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_identity_verification_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_identity_verification_signature_link_id_fkey"
            columns: ["signature_link_id"]
            isOneToOne: false
            referencedRelation: "signature_links"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_links: {
        Row: {
          access_count: number | null
          accessed_at: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          expires_at: string
          id: string
          ip_addresses: Json | null
          is_active: boolean | null
          package_id: string | null
          recipient_email: string | null
          recipient_id: string | null
          recipient_name: string | null
          recipient_phone: string | null
          recipient_type: string
          sale_addendum_beneficiary_id: string | null
          sale_addendum_id: string | null
          sale_id: string
          signwell_document_id: string | null
          signwell_signing_url: string | null
          status: string | null
          step_order: number | null
          token: string
          updated_at: string | null
        }
        Insert: {
          access_count?: number | null
          accessed_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          expires_at: string
          id?: string
          ip_addresses?: Json | null
          is_active?: boolean | null
          package_id?: string | null
          recipient_email?: string | null
          recipient_id?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          recipient_type: string
          sale_addendum_beneficiary_id?: string | null
          sale_addendum_id?: string | null
          sale_id: string
          signwell_document_id?: string | null
          signwell_signing_url?: string | null
          status?: string | null
          step_order?: number | null
          token: string
          updated_at?: string | null
        }
        Update: {
          access_count?: number | null
          accessed_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string
          id?: string
          ip_addresses?: Json | null
          is_active?: boolean | null
          package_id?: string | null
          recipient_email?: string | null
          recipient_id?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          recipient_type?: string
          sale_addendum_beneficiary_id?: string | null
          sale_addendum_id?: string | null
          sale_id?: string
          signwell_document_id?: string | null
          signwell_signing_url?: string | null
          status?: string | null
          step_order?: number | null
          token?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signature_links_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "document_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_links_sale_addendum_beneficiary_id_fkey"
            columns: ["sale_addendum_beneficiary_id"]
            isOneToOne: false
            referencedRelation: "sale_addendum_beneficiaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_links_sale_addendum_id_fkey"
            columns: ["sale_addendum_id"]
            isOneToOne: false
            referencedRelation: "sale_addendums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_links_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_links_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_links_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_policies: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_active: boolean | null
          title: string
          version: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          title?: string
          version: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          title?: string
          version?: string
        }
        Relationships: []
      }
      signature_workflow_steps: {
        Row: {
          completed_at: string | null
          created_at: string | null
          data: Json | null
          document_id: string | null
          id: string
          signature_link_id: string
          started_at: string | null
          status: string | null
          step_order: number
          step_type: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          data?: Json | null
          document_id?: string | null
          id?: string
          signature_link_id: string
          started_at?: string | null
          status?: string | null
          step_order: number
          step_type: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          data?: Json | null
          document_id?: string | null
          id?: string
          signature_link_id?: string
          started_at?: string | null
          status?: string | null
          step_order?: number
          step_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "signature_workflow_steps_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_workflow_steps_signature_link_id_fkey"
            columns: ["signature_link_id"]
            isOneToOne: false
            referencedRelation: "signature_links"
            referencedColumns: ["id"]
          },
        ]
      }
      signatures: {
        Row: {
          created_at: string | null
          document_id: string | null
          id: string
          sale_id: string
          signature_data: string
          signed_at: string | null
          signer_email: string | null
          signer_ip: string | null
          signer_name: string | null
        }
        Insert: {
          created_at?: string | null
          document_id?: string | null
          id?: string
          sale_id: string
          signature_data: string
          signed_at?: string | null
          signer_email?: string | null
          signer_ip?: string | null
          signer_name?: string | null
        }
        Update: {
          created_at?: string | null
          document_id?: string | null
          id?: string
          sale_id?: string
          signature_data?: string
          signed_at?: string | null
          signer_email?: string | null
          signer_ip?: string | null
          signer_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signatures_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signatures_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signatures_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signatures_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_campaigns: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          message: string
          name: string
          scheduled_at: string | null
          sent_at: string | null
          sent_count: number | null
          status: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          message: string
          name: string
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number | null
          status?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          message?: string
          name?: string
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      template_analytics: {
        Row: {
          avg_completion_time: number | null
          completions_count: number | null
          created_at: string | null
          id: string
          last_used_at: string | null
          template_id: string
          updated_at: string | null
          views_count: number | null
        }
        Insert: {
          avg_completion_time?: number | null
          completions_count?: number | null
          created_at?: string | null
          id?: string
          last_used_at?: string | null
          template_id: string
          updated_at?: string | null
          views_count?: number | null
        }
        Update: {
          avg_completion_time?: number | null
          completions_count?: number | null
          created_at?: string | null
          id?: string
          last_used_at?: string | null
          template_id?: string
          updated_at?: string | null
          views_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "template_analytics_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_asset_pages: {
        Row: {
          asset_id: string
          created_at: string
          height: number | null
          id: string
          page_number: number
          preview_image_url: string | null
          width: number | null
        }
        Insert: {
          asset_id: string
          created_at?: string
          height?: number | null
          id?: string
          page_number: number
          preview_image_url?: string | null
          width?: number | null
        }
        Update: {
          asset_id?: string
          created_at?: string
          height?: number | null
          id?: string
          page_number?: number
          preview_image_url?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "template_asset_pages_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "template_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      template_assets: {
        Row: {
          asset_type: string
          converted_asset_id: string | null
          created_at: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          metadata: Json
          mime_type: string | null
          page_count: number | null
          processing_error: string | null
          processing_progress: number | null
          status: string
          template_id: string
        }
        Insert: {
          asset_type: string
          converted_asset_id?: string | null
          created_at?: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          metadata?: Json
          mime_type?: string | null
          page_count?: number | null
          processing_error?: string | null
          processing_progress?: number | null
          status?: string
          template_id: string
        }
        Update: {
          asset_type?: string
          converted_asset_id?: string | null
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          metadata?: Json
          mime_type?: string | null
          page_count?: number | null
          processing_error?: string | null
          processing_progress?: number | null
          status?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_assets_converted_asset_id_fkey"
            columns: ["converted_asset_id"]
            isOneToOne: false
            referencedRelation: "template_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_assets_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          sort_order: number | null
          template_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          sort_order?: number | null
          template_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          sort_order?: number | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_attachments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_blocks: {
        Row: {
          block_type: string
          content: Json
          created_at: string
          h: number
          id: string
          is_locked: boolean
          is_visible: boolean
          page: number
          rotation: number
          sort_order: number
          style: Json
          template_id: string
          updated_at: string
          visibility_rules: Json
          w: number
          x: number
          y: number
          z_index: number
        }
        Insert: {
          block_type: string
          content?: Json
          created_at?: string
          h?: number
          id?: string
          is_locked?: boolean
          is_visible?: boolean
          page?: number
          rotation?: number
          sort_order?: number
          style?: Json
          template_id: string
          updated_at?: string
          visibility_rules?: Json
          w?: number
          x?: number
          y?: number
          z_index?: number
        }
        Update: {
          block_type?: string
          content?: Json
          created_at?: string
          h?: number
          id?: string
          is_locked?: boolean
          is_visible?: boolean
          page?: number
          rotation?: number
          sort_order?: number
          style?: Json
          template_id?: string
          updated_at?: string
          visibility_rules?: Json
          w?: number
          x?: number
          y?: number
          z_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "template_blocks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_comments: {
        Row: {
          comment_text: string
          created_at: string | null
          id: string
          template_id: string
          user_id: string | null
        }
        Insert: {
          comment_text: string
          created_at?: string | null
          id?: string
          template_id: string
          user_id?: string | null
        }
        Update: {
          comment_text?: string
          created_at?: string | null
          id?: string
          template_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_comments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_fields: {
        Row: {
          block_id: string | null
          created_at: string
          field_type: string
          h: number
          id: string
          label: string | null
          meta: Json
          page: number
          required: boolean
          signer_role: string
          template_id: string
          w: number
          x: number
          y: number
        }
        Insert: {
          block_id?: string | null
          created_at?: string
          field_type: string
          h?: number
          id?: string
          label?: string | null
          meta?: Json
          page?: number
          required?: boolean
          signer_role: string
          template_id: string
          w?: number
          x?: number
          y?: number
        }
        Update: {
          block_id?: string | null
          created_at?: string
          field_type?: string
          h?: number
          id?: string
          label?: string | null
          meta?: Json
          page?: number
          required?: boolean
          signer_role?: string
          template_id?: string
          w?: number
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "template_fields_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "template_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_fields_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_placeholders: {
        Row: {
          created_at: string | null
          default_value: string | null
          description: string | null
          id: string
          is_system: boolean | null
          placeholder_label: string
          placeholder_name: string
          placeholder_type: string | null
        }
        Insert: {
          created_at?: string | null
          default_value?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          placeholder_label: string
          placeholder_name: string
          placeholder_type?: string | null
        }
        Update: {
          created_at?: string | null
          default_value?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          placeholder_label?: string
          placeholder_name?: string
          placeholder_type?: string | null
        }
        Relationships: []
      }
      template_question_options: {
        Row: {
          created_at: string | null
          id: string
          option_text: string
          option_value: string | null
          question_id: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          option_text: string
          option_value?: string | null
          question_id: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          option_text?: string
          option_value?: string | null
          question_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "template_question_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "template_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      template_questions: {
        Row: {
          created_at: string | null
          id: string
          is_required: boolean | null
          placeholder_name: string | null
          question_text: string
          question_type: string | null
          sort_order: number | null
          template_id: string
          validation_rules: Json | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_required?: boolean | null
          placeholder_name?: string | null
          question_text: string
          question_type?: string | null
          sort_order?: number | null
          template_id: string
          validation_rules?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_required?: boolean | null
          placeholder_name?: string | null
          question_text?: string
          question_type?: string | null
          sort_order?: number | null
          template_id?: string
          validation_rules?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "template_questions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_responses: {
        Row: {
          created_at: string | null
          id: string
          question_id: string
          response_value: string | null
          sale_id: string
          template_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          question_id: string
          response_value?: string | null
          sale_id: string
          template_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          question_id?: string
          response_value?: string | null
          sale_id?: string
          template_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "template_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_responses_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_responses_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_responses_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_responses_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_versions: {
        Row: {
          content: string | null
          created_at: string | null
          created_by: string | null
          designer_version: string
          id: string
          is_published: boolean
          layout_snapshot: Json
          template_id: string
          version_label: string | null
          version_number: number
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          designer_version?: string
          id?: string
          is_published?: boolean
          layout_snapshot?: Json
          template_id: string
          version_label?: string | null
          version_number: number
        }
        Update: {
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          designer_version?: string
          id?: string
          is_published?: boolean
          layout_snapshot?: Json
          template_id?: string
          version_label?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_workflow_states: {
        Row: {
          created_at: string | null
          id: string
          is_final: boolean | null
          state_name: string
          state_order: number | null
          template_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_final?: boolean | null
          state_name: string
          state_order?: number | null
          template_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_final?: boolean | null
          state_name?: string
          state_order?: number | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_workflow_states_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          company_id: string
          content: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          designer_version: string
          id: string
          is_active: boolean | null
          name: string
          pdf_layout: Json | null
          published_version_id: string | null
          render_engine: string
          requires_signature: boolean | null
          template_type: string | null
          updated_at: string | null
          uses_dynamic_fields: boolean | null
          version: number | null
        }
        Insert: {
          company_id: string
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          designer_version?: string
          id?: string
          is_active?: boolean | null
          name: string
          pdf_layout?: Json | null
          published_version_id?: string | null
          render_engine?: string
          requires_signature?: boolean | null
          template_type?: string | null
          updated_at?: string | null
          uses_dynamic_fields?: boolean | null
          version?: number | null
        }
        Update: {
          company_id?: string
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          designer_version?: string
          id?: string
          is_active?: boolean | null
          name?: string
          pdf_layout?: Json | null
          published_version_id?: string | null
          render_engine?: string
          requires_signature?: boolean | null
          template_type?: string | null
          updated_at?: string | null
          uses_dynamic_fields?: boolean | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          created_at: string
          granted: boolean
          granted_by: string | null
          id: string
          permission_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted?: boolean
          granted_by?: string | null
          id?: string
          permission_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted?: boolean
          granted_by?: string | null
          id?: string
          permission_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      waha_health_logs: {
        Row: {
          checked_at: string
          company_id: string
          created_at: string
          error_message: string | null
          id: string
          response_time_ms: number | null
          session_status: string
        }
        Insert: {
          checked_at?: string
          company_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          response_time_ms?: number | null
          session_status?: string
        }
        Update: {
          checked_at?: string
          company_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          response_time_ms?: number | null
          session_status?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          company_id: string
          created_at: string | null
          delivered_at: string | null
          error_message: string | null
          id: string
          message_body: string
          message_type: string | null
          phone_number: string
          read_at: string | null
          sale_id: string | null
          sent_at: string | null
          sent_by: string | null
          signature_link_id: string | null
          status: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          message_body: string
          message_type?: string | null
          phone_number: string
          read_at?: string | null
          sale_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          signature_link_id?: string | null
          status?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          message_body?: string
          message_type?: string | null
          phone_number?: string
          read_at?: string | null
          sale_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          signature_link_id?: string | null
          status?: string | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_signature_link_id_fkey"
            columns: ["signature_link_id"]
            isOneToOne: false
            referencedRelation: "signature_links"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_notifications: {
        Row: {
          company_id: string
          created_at: string | null
          error_message: string | null
          id: string
          message: string
          phone_number: string
          sale_id: string | null
          sent_at: string | null
          status: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          message: string
          phone_number: string
          sale_id?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          message?: string
          phone_number?: string
          sale_id?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_notifications_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "auditor_sales_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_notifications_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_notifications_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_completed_view"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          company_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          message_body: string
          template_key: string
          template_name: string
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          message_body: string
          template_key: string
          template_name: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          message_body?: string
          template_key?: string
          template_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      auditor_sales_view: {
        Row: {
          adherents_count: number | null
          all_signatures_completed: boolean | null
          attached_docs_count: number | null
          audit_notes: string | null
          audit_status: string | null
          audited_at: string | null
          auditor_id: string | null
          billing_email: string | null
          billing_phone: string | null
          billing_razon_social: string | null
          billing_ruc: string | null
          client_id: string | null
          company_id: string | null
          contract_number: string | null
          contract_pdf_url: string | null
          contract_start_date: string | null
          created_at: string | null
          id: string | null
          immediate_coverage: boolean | null
          last_doc_uploaded_at: string | null
          notes: string | null
          plan_id: string | null
          request_number: string | null
          requires_adherents: boolean | null
          sale_date: string | null
          sale_type: string | null
          salesperson_id: string | null
          signature_completed_at: string | null
          signature_expires_at: string | null
          signature_token: string | null
          signed_at: string | null
          signed_ip: string | null
          signer_dni: string | null
          signer_name: string | null
          signer_relationship: string | null
          signer_type: string | null
          status: Database["public"]["Enums"]["sale_status"] | null
          template_id: string | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          adherents_count?: number | null
          all_signatures_completed?: boolean | null
          attached_docs_count?: never
          audit_notes?: string | null
          audit_status?: string | null
          audited_at?: string | null
          auditor_id?: string | null
          billing_email?: string | null
          billing_phone?: string | null
          billing_razon_social?: string | null
          billing_ruc?: string | null
          client_id?: string | null
          company_id?: string | null
          contract_number?: string | null
          contract_pdf_url?: string | null
          contract_start_date?: string | null
          created_at?: string | null
          id?: string | null
          immediate_coverage?: boolean | null
          last_doc_uploaded_at?: never
          notes?: string | null
          plan_id?: string | null
          request_number?: string | null
          requires_adherents?: boolean | null
          sale_date?: string | null
          sale_type?: string | null
          salesperson_id?: string | null
          signature_completed_at?: string | null
          signature_expires_at?: string | null
          signature_token?: string | null
          signed_at?: string | null
          signed_ip?: string | null
          signer_dni?: string | null
          signer_name?: string | null
          signer_relationship?: string | null
          signer_type?: string | null
          status?: Database["public"]["Enums"]["sale_status"] | null
          template_id?: string | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          adherents_count?: number | null
          all_signatures_completed?: boolean | null
          attached_docs_count?: never
          audit_notes?: string | null
          audit_status?: string | null
          audited_at?: string | null
          auditor_id?: string | null
          billing_email?: string | null
          billing_phone?: string | null
          billing_razon_social?: string | null
          billing_ruc?: string | null
          client_id?: string | null
          company_id?: string | null
          contract_number?: string | null
          contract_pdf_url?: string | null
          contract_start_date?: string | null
          created_at?: string | null
          id?: string | null
          immediate_coverage?: boolean | null
          last_doc_uploaded_at?: never
          notes?: string | null
          plan_id?: string | null
          request_number?: string | null
          requires_adherents?: boolean | null
          sale_date?: string | null
          sale_type?: string | null
          salesperson_id?: string | null
          signature_completed_at?: string | null
          signature_expires_at?: string | null
          signature_token?: string | null
          signed_at?: string | null
          signed_ip?: string | null
          signer_dni?: string | null
          signer_name?: string | null
          signer_relationship?: string | null
          signer_type?: string | null
          status?: Database["public"]["Enums"]["sale_status"] | null
          template_id?: string | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_sales_salesperson"
            columns: ["salesperson_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_period_payable: {
        Row: {
          adicional: number | null
          bonificacion: number | null
          company_id: string | null
          currency_code: string | null
          descuento: number | null
          items_count: number | null
          otro: number | null
          period_id: string | null
          recupero: number | null
          salesperson_id: string | null
          status: string | null
          total_a_cobrar: number | null
          total_adjustments: number | null
          total_items: number | null
          viatico: number | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_periods_salesperson_id_fkey"
            columns: ["salesperson_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_public_settings: {
        Row: {
          company_id: string | null
          contratada_signature_mode: string | null
          contratada_signer_dni: string | null
          contratada_signer_email: string | null
          contratada_signer_name: string | null
          contratada_signer_phone: string | null
          email_from_address: string | null
          email_from_name: string | null
          pdf_footer_image_url: string | null
          pdf_header_image_url: string | null
          signature_block_style: Json | null
          whatsapp_gateway_url: string | null
          whatsapp_linked_phone: string | null
          whatsapp_provider: string | null
        }
        Insert: {
          company_id?: string | null
          contratada_signature_mode?: string | null
          contratada_signer_dni?: string | null
          contratada_signer_email?: string | null
          contratada_signer_name?: string | null
          contratada_signer_phone?: string | null
          email_from_address?: string | null
          email_from_name?: string | null
          pdf_footer_image_url?: string | null
          pdf_header_image_url?: string | null
          signature_block_style?: Json | null
          whatsapp_gateway_url?: string | null
          whatsapp_linked_phone?: string | null
          whatsapp_provider?: string | null
        }
        Update: {
          company_id?: string | null
          contratada_signature_mode?: string | null
          contratada_signer_dni?: string | null
          contratada_signer_email?: string | null
          contratada_signer_name?: string | null
          contratada_signer_phone?: string | null
          email_from_address?: string | null
          email_from_name?: string | null
          pdf_footer_image_url?: string | null
          pdf_header_image_url?: string | null
          signature_block_style?: Json | null
          whatsapp_gateway_url?: string | null
          whatsapp_linked_phone?: string | null
          whatsapp_provider?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings_admin_ui: {
        Row: {
          company_id: string | null
          contratada_signature_mode: string | null
          contratada_signer_dni: string | null
          contratada_signer_email: string | null
          contratada_signer_name: string | null
          contratada_signer_phone: string | null
          email_from_address: string | null
          email_from_name: string | null
          email_provider: string | null
          has_email_api_key: boolean | null
          has_signwell_api_key: boolean | null
          has_sms_api_key: boolean | null
          has_twilio_auth_token: boolean | null
          has_whatsapp_api_key: boolean | null
          menu_config: Json | null
          pdf_footer_image_url: string | null
          pdf_header_image_url: string | null
          signature_block_style: Json | null
          signwell_enabled: boolean | null
          twilio_account_sid: string | null
          twilio_whatsapp_number: string | null
          whatsapp_gateway_url: string | null
          whatsapp_linked_phone: string | null
          whatsapp_phone_id: string | null
          whatsapp_provider: string | null
        }
        Insert: {
          company_id?: string | null
          contratada_signature_mode?: string | null
          contratada_signer_dni?: string | null
          contratada_signer_email?: string | null
          contratada_signer_name?: string | null
          contratada_signer_phone?: string | null
          email_from_address?: string | null
          email_from_name?: string | null
          email_provider?: string | null
          has_email_api_key?: never
          has_signwell_api_key?: never
          has_sms_api_key?: never
          has_twilio_auth_token?: never
          has_whatsapp_api_key?: never
          menu_config?: Json | null
          pdf_footer_image_url?: string | null
          pdf_header_image_url?: string | null
          signature_block_style?: Json | null
          signwell_enabled?: boolean | null
          twilio_account_sid?: string | null
          twilio_whatsapp_number?: string | null
          whatsapp_gateway_url?: string | null
          whatsapp_linked_phone?: string | null
          whatsapp_phone_id?: string | null
          whatsapp_provider?: string | null
        }
        Update: {
          company_id?: string | null
          contratada_signature_mode?: string | null
          contratada_signer_dni?: string | null
          contratada_signer_email?: string | null
          contratada_signer_name?: string | null
          contratada_signer_phone?: string | null
          email_from_address?: string | null
          email_from_name?: string | null
          email_provider?: string | null
          has_email_api_key?: never
          has_signwell_api_key?: never
          has_sms_api_key?: never
          has_twilio_auth_token?: never
          has_whatsapp_api_key?: never
          menu_config?: Json | null
          pdf_footer_image_url?: string | null
          pdf_header_image_url?: string | null
          signature_block_style?: Json | null
          signwell_enabled?: boolean | null
          twilio_account_sid?: string | null
          twilio_whatsapp_number?: string | null
          whatsapp_gateway_url?: string | null
          whatsapp_linked_phone?: string | null
          whatsapp_phone_id?: string | null
          whatsapp_provider?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings_public: {
        Row: {
          company_id: string | null
          contratada_signature_mode: string | null
          contratada_signer_name: string | null
          signature_block_style: Json | null
        }
        Insert: {
          company_id?: string | null
          contratada_signature_mode?: string | null
          contratada_signer_name?: string | null
          signature_block_style?: Json | null
        }
        Update: {
          company_id?: string | null
          contratada_signature_mode?: string | null
          contratada_signer_name?: string | null
          signature_block_style?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_completed_view: {
        Row: {
          adherents_count: number | null
          all_signatures_completed: boolean | null
          audit_notes: string | null
          audit_status: string | null
          audited_at: string | null
          auditor_id: string | null
          billing_email: string | null
          billing_phone: string | null
          billing_razon_social: string | null
          billing_ruc: string | null
          client_id: string | null
          company_id: string | null
          contract_number: string | null
          contract_pdf_url: string | null
          contract_start_date: string | null
          created_at: string | null
          id: string | null
          immediate_coverage: boolean | null
          notes: string | null
          plan_id: string | null
          request_number: string | null
          requires_adherents: boolean | null
          sale_date: string | null
          sale_type: string | null
          salesperson_id: string | null
          signature_completed_at: string | null
          signature_expires_at: string | null
          signature_token: string | null
          signed_at: string | null
          signed_ip: string | null
          signer_dni: string | null
          signer_email: string | null
          signer_name: string | null
          signer_phone: string | null
          signer_relationship: string | null
          signer_type: string | null
          status: Database["public"]["Enums"]["sale_status"] | null
          template_id: string | null
          titular_amount: number | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          adherents_count?: number | null
          all_signatures_completed?: boolean | null
          audit_notes?: string | null
          audit_status?: string | null
          audited_at?: string | null
          auditor_id?: string | null
          billing_email?: string | null
          billing_phone?: string | null
          billing_razon_social?: string | null
          billing_ruc?: string | null
          client_id?: string | null
          company_id?: string | null
          contract_number?: string | null
          contract_pdf_url?: string | null
          contract_start_date?: string | null
          created_at?: string | null
          id?: string | null
          immediate_coverage?: boolean | null
          notes?: string | null
          plan_id?: string | null
          request_number?: string | null
          requires_adherents?: boolean | null
          sale_date?: string | null
          sale_type?: string | null
          salesperson_id?: string | null
          signature_completed_at?: string | null
          signature_expires_at?: string | null
          signature_token?: string | null
          signed_at?: string | null
          signed_ip?: string | null
          signer_dni?: string | null
          signer_email?: string | null
          signer_name?: string | null
          signer_phone?: string | null
          signer_relationship?: string | null
          signer_type?: string | null
          status?: Database["public"]["Enums"]["sale_status"] | null
          template_id?: string | null
          titular_amount?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          adherents_count?: number | null
          all_signatures_completed?: boolean | null
          audit_notes?: string | null
          audit_status?: string | null
          audited_at?: string | null
          auditor_id?: string | null
          billing_email?: string | null
          billing_phone?: string | null
          billing_razon_social?: string | null
          billing_ruc?: string | null
          client_id?: string | null
          company_id?: string | null
          contract_number?: string | null
          contract_pdf_url?: string | null
          contract_start_date?: string | null
          created_at?: string | null
          id?: string | null
          immediate_coverage?: boolean | null
          notes?: string | null
          plan_id?: string | null
          request_number?: string | null
          requires_adherents?: boolean | null
          sale_date?: string | null
          sale_type?: string | null
          salesperson_id?: string | null
          signature_completed_at?: string | null
          signature_expires_at?: string | null
          signature_token?: string | null
          signed_at?: string | null
          signed_ip?: string | null
          signer_dni?: string | null
          signer_email?: string | null
          signer_name?: string | null
          signer_phone?: string | null
          signer_relationship?: string | null
          signer_type?: string | null
          status?: Database["public"]["Enums"]["sale_status"] | null
          template_id?: string | null
          titular_amount?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_sales_salesperson"
            columns: ["salesperson_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_change_sale_status: {
        Args: {
          p_new_audit_status?: string
          p_new_status: string
          p_reason?: string
          p_sale_id: string
        }
        Returns: Json
      }
      approve_sale_addendum: {
        Args: { p_addendum_id: string; p_note?: string }
        Returns: {
          audit_notes: string | null
          audited_at: string | null
          audited_by: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          id: string
          parent_sale_id: string
          requested_by: string | null
          status: string
          submitted_at: string | null
          type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sale_addendums"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      auth_user_of_profile: { Args: { p_profile_id: string }; Returns: string }
      check_all_signatures_completed: {
        Args: { p_sale_id: string }
        Returns: boolean
      }
      check_and_increment_rate_limit: {
        Args: { p_key: string; p_max_requests: number; p_window_ms: number }
        Returns: Json
      }
      cleanup_rate_limit_log: { Args: never; Returns: undefined }
      commission_add_adjustment: {
        Args: {
          p_amount?: number
          p_base_amount?: number
          p_calc_mode: string
          p_concept: string
          p_item_id?: string
          p_notes?: string
          p_percent?: number
          p_period_id: string
          p_sign?: number
        }
        Returns: {
          amount: number
          base_amount: number | null
          calc_mode: string
          company_id: string
          concept: string
          created_at: string
          created_by: string
          id: string
          item_id: string | null
          notes: string | null
          percent: number | null
          period_id: string
          sign: number
        }
        SetofOptions: {
          from: "*"
          to: "commission_period_adjustments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      commission_admin_fee_for: {
        Args: { p_company_id: string; p_on: string; p_sale_type: string }
        Returns: number
      }
      commission_annul_period: {
        Args: { p_period_id: string; p_reason: string }
        Returns: {
          annulled_at: string | null
          annulled_by: string | null
          annulment_reason: string | null
          closed_at: string | null
          closed_by: string | null
          company_id: string
          concept: string
          created_at: string
          created_by: string
          currency_code: string
          id: string
          liquidation_number: string
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          period_end: string
          period_start: string
          salesperson_email: string | null
          salesperson_id: string
          salesperson_name: string
          status: string
          total_amount: number
        }
        SetofOptions: {
          from: "*"
          to: "commission_periods"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      commission_authorize_company: {
        Args: { p_company_id: string; p_write?: boolean }
        Returns: undefined
      }
      commission_calculate_sale: {
        Args: { p_sale_id: string }
        Returns: {
          base_amount: number
          base_type: string
          calc_mode: string
          client_display_id: string
          client_name: string
          client_sequence: number
          commission_amount: number
          error_code: string
          group_type: string
          percent: number
          plan_name: string
          rule_id: string
          sale_date: string
          sale_id: string
          sale_type: string
        }[]
      }
      commission_can_read_company: {
        Args: { p_company_id: string }
        Returns: boolean
      }
      commission_can_write_company: {
        Args: { p_company_id: string }
        Returns: boolean
      }
      commission_close_period: {
        Args: { p_period_id: string }
        Returns: {
          annulled_at: string | null
          annulled_by: string | null
          annulment_reason: string | null
          closed_at: string | null
          closed_by: string | null
          company_id: string
          concept: string
          created_at: string
          created_by: string
          currency_code: string
          id: string
          liquidation_number: string
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          period_end: string
          period_start: string
          salesperson_email: string | null
          salesperson_id: string
          salesperson_name: string
          status: string
          total_amount: number
        }
        SetofOptions: {
          from: "*"
          to: "commission_periods"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      commission_delete_adjustment: {
        Args: { p_adjustment_id: string }
        Returns: undefined
      }
      commission_export_rows: {
        Args: { p_period_ids: string[] }
        Returns: {
          admin_fee: number
          base_amount: number
          base_type: string
          calc_mode: string
          client_display_id: string
          client_name: string
          commission_amount: number
          contract_number: string
          gross_amount: number
          group_type: string
          item_id: string
          item_number: number
          lives: number
          percent: number
          period_id: string
          plan_name: string
          report_code: string
          sale_date: string
          sale_id: string
          sale_total_amount: number
          sale_type: string
          tax_divisor: number
        }[]
      }
      commission_generate_period: {
        Args: {
          p_company_id: string
          p_concept?: string
          p_from: string
          p_notes?: string
          p_salesperson_id: string
          p_to: string
        }
        Returns: string
      }
      commission_list_salespeople: {
        Args: { p_company_id: string }
        Returns: {
          default_base: string
          default_percent: number
          display_name: string
          email: string
          is_active: boolean
          salesperson_id: string
        }[]
      }
      commission_pay_period: {
        Args: { p_period_id: string }
        Returns: {
          annulled_at: string | null
          annulled_by: string | null
          annulment_reason: string | null
          closed_at: string | null
          closed_by: string | null
          company_id: string
          concept: string
          created_at: string
          created_by: string
          currency_code: string
          id: string
          liquidation_number: string
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          period_end: string
          period_start: string
          salesperson_email: string | null
          salesperson_id: string
          salesperson_name: string
          status: string
          total_amount: number
        }
        SetofOptions: {
          from: "*"
          to: "commission_periods"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      commission_preview: {
        Args: {
          p_company_id: string
          p_from: string
          p_salesperson_id: string
          p_to: string
        }
        Returns: {
          base_amount: number
          base_type: string
          calc_mode: string
          client_display_id: string
          client_name: string
          client_sequence: number
          commission_amount: number
          error_code: string
          group_type: string
          percent: number
          plan_name: string
          rule_id: string
          sale_date: string
          sale_id: string
          sale_type: string
        }[]
      }
      commission_resolve_rule: {
        Args: { p_sale_id: string }
        Returns: {
          base_amount: number
          base_type: string
          calc_mode: string
          commission_amount: number
          error_code: string
          percent: number
          rule_id: string
          sale_id: string
        }[]
      }
      commission_suggest_maternity_adjustments: {
        Args: { p_period_id: string }
        Returns: number
      }
      complete_adherent_incorporation: {
        Args: { p_signature_link_id: string }
        Returns: string
      }
      get_contratada_info_by_token: {
        Args: { p_token: string }
        Returns: {
          company_name: string
          signer_dni: string
          signer_email: string
          signer_name: string
          signer_phone: string
        }[]
      }
      get_otp_policy_for_signature: {
        Args: { p_company_id: string }
        Returns: {
          allowed_channels: Json
          default_channel: string
          max_attempts: number
          otp_expiration_seconds: number
          otp_length: number
          require_otp_for_signature: boolean
          whatsapp_otp_enabled: boolean
        }[]
      }
      get_pdf_branding_by_token: {
        Args: { p_token: string }
        Returns: {
          pdf_footer_image_url: string
          pdf_header_image_url: string
        }[]
      }
      get_public_branding: {
        Args: never
        Returns: {
          accent_color: string
          login_background_url: string
          login_logo_url: string
          logo_url: string
          name: string
          primary_color: string
          secondary_color: string
        }[]
      }
      get_sale_id_from_signature_token: { Args: never; Returns: string }
      get_sales_metrics: {
        Args: { p_company_id: string; p_from?: string; p_to?: string }
        Returns: Json
      }
      get_signature_link_id_from_token: { Args: never; Returns: string }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      get_user_permissions: {
        Args: { _user_id: string }
        Returns: {
          granted: boolean
          permission_key: string
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      notify_expiring_sales: { Args: { p_dias?: number }; Returns: number }
      recalculate_sale_total_amount: {
        Args: { p_sale_id: string }
        Returns: undefined
      }
      reject_sale_addendum: {
        Args: { p_addendum_id: string; p_note: string }
        Returns: {
          audit_notes: string | null
          audited_at: string | null
          audited_by: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          id: string
          parent_sale_id: string
          requested_by: string | null
          status: string
          submitted_at: string | null
          type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sale_addendums"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      try_complete_sale_addendum_for_link: {
        Args: { p_signature_link_id: string }
        Returns: boolean
      }
      user_has_permission: {
        Args: { _permission_key: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "admin"
        | "gestor"
        | "vendedor"
        | "supervisor"
        | "auditor"
        | "financiero"
      document_status: "pendiente" | "firmado" | "vencido"
      sale_status:
        | "borrador"
        | "enviado"
        | "firmado"
        | "completado"
        | "cancelado"
        | "pendiente"
        | "en_auditoria"
        | "rechazado"
        | "aprobado_para_templates"
        | "preparando_documentos"
        | "esperando_ddjj"
        | "en_revision"
        | "listo_para_enviar"
        | "firmado_parcial"
        | "expirado"
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
      app_role: [
        "super_admin",
        "admin",
        "gestor",
        "vendedor",
        "supervisor",
        "auditor",
        "financiero",
      ],
      document_status: ["pendiente", "firmado", "vencido"],
      sale_status: [
        "borrador",
        "enviado",
        "firmado",
        "completado",
        "cancelado",
        "pendiente",
        "en_auditoria",
        "rechazado",
        "aprobado_para_templates",
        "preparando_documentos",
        "esperando_ddjj",
        "en_revision",
        "listo_para_enviar",
        "firmado_parcial",
        "expirado",
      ],
    },
  },
} as const
