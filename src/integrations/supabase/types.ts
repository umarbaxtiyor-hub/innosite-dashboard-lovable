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
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          changed_fields: string[] | null
          created_at: string
          error_context: string | null
          error_message: string | null
          error_sqlstate: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          telegram_user_id: number | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changed_fields?: string[] | null
          created_at?: string
          error_context?: string | null
          error_message?: string | null
          error_sqlstate?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          telegram_user_id?: number | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changed_fields?: string[] | null
          created_at?: string
          error_context?: string | null
          error_message?: string | null
          error_sqlstate?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          telegram_user_id?: number | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      boq_items: {
        Row: {
          actual_cost: number | null
          category: string | null
          code: string
          created_at: string
          description: string
          id: string
          planned_cost: number | null
          project_id: string
          qty: number | null
          rate: number | null
          unit: string | null
        }
        Insert: {
          actual_cost?: number | null
          category?: string | null
          code: string
          created_at?: string
          description: string
          id?: string
          planned_cost?: number | null
          project_id: string
          qty?: number | null
          rate?: number | null
          unit?: string | null
        }
        Update: {
          actual_cost?: number | null
          category?: string | null
          code?: string
          created_at?: string
          description?: string
          id?: string
          planned_cost?: number | null
          project_id?: string
          qty?: number | null
          rate?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "boq_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boq_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_messages: {
        Row: {
          description: string | null
          key: string
          text: string
          updated_at: string
        }
        Insert: {
          description?: string | null
          key: string
          text: string
          updated_at?: string
        }
        Update: {
          description?: string | null
          key?: string
          text?: string
          updated_at?: string
        }
        Relationships: []
      }
      brigade_members: {
        Row: {
          brigade_id: string
          created_at: string
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          position: string | null
        }
        Insert: {
          brigade_id: string
          created_at?: string
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          position?: string | null
        }
        Update: {
          brigade_id?: string
          created_at?: string
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          position?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bmem_brigade_fk"
            columns: ["brigade_id"]
            isOneToOne: false
            referencedRelation: "brigades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brigade_members_brigade_id_fkey"
            columns: ["brigade_id"]
            isOneToOne: false
            referencedRelation: "brigades"
            referencedColumns: ["id"]
          },
        ]
      }
      brigade_payments: {
        Row: {
          amount: number
          brigade_id: string
          brigade_name: string | null
          created_at: string
          created_by: string | null
          id: string
          import_hash: string | null
          kind: Database["public"]["Enums"]["brigade_payment_kind"]
          note: string | null
          payment_date: string
          project_id: string
          source: string | null
          source_note: string | null
          telegram_user_id: number | null
        }
        Insert: {
          amount: number
          brigade_id: string
          brigade_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          import_hash?: string | null
          kind?: Database["public"]["Enums"]["brigade_payment_kind"]
          note?: string | null
          payment_date?: string
          project_id: string
          source?: string | null
          source_note?: string | null
          telegram_user_id?: number | null
        }
        Update: {
          amount?: number
          brigade_id?: string
          brigade_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          import_hash?: string | null
          kind?: Database["public"]["Enums"]["brigade_payment_kind"]
          note?: string | null
          payment_date?: string
          project_id?: string
          source?: string | null
          source_note?: string | null
          telegram_user_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bp_brigade_fk"
            columns: ["brigade_id"]
            isOneToOne: false
            referencedRelation: "brigades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bp_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      brigades: {
        Row: {
          created_at: string
          firm_id: string | null
          id: string
          leader: string | null
          member_count: number | null
          name: string
          notes: string | null
          phone: string | null
        }
        Insert: {
          created_at?: string
          firm_id?: string | null
          id?: string
          leader?: string | null
          member_count?: number | null
          name: string
          notes?: string | null
          phone?: string | null
        }
        Update: {
          created_at?: string
          firm_id?: string | null
          id?: string
          leader?: string | null
          member_count?: number | null
          name?: string
          notes?: string | null
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brigades_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          file_name: string | null
          file_url: string
          id: string
          mime_type: string | null
          project_id: string | null
          related_id: string | null
          related_table: string | null
          telegram_user_id: number | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_url: string
          id?: string
          mime_type?: string | null
          project_id?: string | null
          related_id?: string | null
          related_table?: string | null
          telegram_user_id?: number | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_url?: string
          id?: string
          mime_type?: string | null
          project_id?: string | null
          related_id?: string | null
          related_table?: string | null
          telegram_user_id?: number | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_attendance: {
        Row: {
          address: string | null
          attendance_date: string
          created_at: string
          distance_m: number | null
          employee_id: string | null
          employee_name: string | null
          id: string
          is_within_geofence: boolean | null
          kind: string
          lat: number | null
          lng: number | null
          note: string | null
          project_id: string | null
          telegram_user_id: number | null
        }
        Insert: {
          address?: string | null
          attendance_date?: string
          created_at?: string
          distance_m?: number | null
          employee_id?: string | null
          employee_name?: string | null
          id?: string
          is_within_geofence?: boolean | null
          kind: string
          lat?: number | null
          lng?: number | null
          note?: string | null
          project_id?: string | null
          telegram_user_id?: number | null
        }
        Update: {
          address?: string | null
          attendance_date?: string
          created_at?: string
          distance_m?: number | null
          employee_id?: string | null
          employee_name?: string | null
          id?: string
          is_within_geofence?: boolean | null
          kind?: string
          lat?: number | null
          lng?: number | null
          note?: string | null
          project_id?: string | null
          telegram_user_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_attendance_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_payments: {
        Row: {
          amount: number
          created_at: string
          employee_id: string
          id: string
          kind: Database["public"]["Enums"]["employee_payment_kind"]
          note: string | null
          payment_date: string
          project_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          employee_id: string
          id?: string
          kind?: Database["public"]["Enums"]["employee_payment_kind"]
          note?: string | null
          payment_date?: string
          project_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          employee_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["employee_payment_kind"]
          note?: string | null
          payment_date?: string
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ep_employee_fk"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ep_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          active: boolean
          created_at: string
          firm_id: string | null
          full_name: string
          id: string
          monthly_salary: number | null
          notes: string | null
          phone: string | null
          position: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          firm_id?: string | null
          full_name: string
          id?: string
          monthly_salary?: number | null
          notes?: string | null
          phone?: string | null
          position?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          firm_id?: string | null
          full_name?: string
          id?: string
          monthly_salary?: number | null
          notes?: string | null
          phone?: string | null
          position?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      expense_units: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          boq_code: string | null
          boq_item_id: string | null
          brigade_id: string | null
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          expense_date: string
          id: string
          import_hash: string | null
          master_work_id: string | null
          paid_by: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          project_id: string | null
          qty: number | null
          receipt_url: string | null
          source: string | null
          source_note: string | null
          telegram_user_id: number | null
          unit: string | null
          unit_price: number | null
          work_progress_id: string | null
          zayavka_id: string | null
        }
        Insert: {
          amount: number
          boq_code?: string | null
          boq_item_id?: string | null
          brigade_id?: string | null
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          import_hash?: string | null
          master_work_id?: string | null
          paid_by?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          project_id?: string | null
          qty?: number | null
          receipt_url?: string | null
          source?: string | null
          source_note?: string | null
          telegram_user_id?: number | null
          unit?: string | null
          unit_price?: number | null
          work_progress_id?: string | null
          zayavka_id?: string | null
        }
        Update: {
          amount?: number
          boq_code?: string | null
          boq_item_id?: string | null
          brigade_id?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          import_hash?: string | null
          master_work_id?: string | null
          paid_by?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          project_id?: string | null
          qty?: number | null
          receipt_url?: string | null
          source?: string | null
          source_note?: string | null
          telegram_user_id?: number | null
          unit?: string | null
          unit_price?: number | null
          work_progress_id?: string | null
          zayavka_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exp_boq_item_fk"
            columns: ["boq_item_id"]
            isOneToOne: false
            referencedRelation: "boq_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exp_brigade_fk"
            columns: ["brigade_id"]
            isOneToOne: false
            referencedRelation: "brigades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exp_master_work_fk"
            columns: ["master_work_id"]
            isOneToOne: false
            referencedRelation: "master_works"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exp_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exp_work_progress_fk"
            columns: ["work_progress_id"]
            isOneToOne: false
            referencedRelation: "work_progress"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exp_zayavka_fk"
            columns: ["zayavka_id"]
            isOneToOne: false
            referencedRelation: "project_zayavka"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exp_zayavka_fk"
            columns: ["zayavka_id"]
            isOneToOne: false
            referencedRelation: "v_master_zayavka_remaining"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exp_zayavka_fk"
            columns: ["zayavka_id"]
            isOneToOne: false
            referencedRelation: "warehouse_balance"
            referencedColumns: ["zayavka_id"]
          },
          {
            foreignKeyName: "expenses_boq_item_id_fkey"
            columns: ["boq_item_id"]
            isOneToOne: false
            referencedRelation: "boq_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      firms: {
        Row: {
          address: string | null
          created_at: string
          id: string
          inn: string | null
          name: string
          notes: string | null
          phone: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          inn?: string | null
          name: string
          notes?: string | null
          phone?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          inn?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      incomes: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          income_date: string
          payer: string | null
          payment_method: string
          project_id: string | null
          source: string | null
          source_note: string | null
          telegram_user_id: number | null
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          income_date?: string
          payer?: string | null
          payment_method?: string
          project_id?: string | null
          source?: string | null
          source_note?: string | null
          telegram_user_id?: number | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          income_date?: string
          payer?: string | null
          payment_method?: string
          project_id?: string | null
          source?: string | null
          source_note?: string | null
          telegram_user_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "incomes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      master_materials: {
        Row: {
          aliases: string[] | null
          created_at: string
          id: string
          name: string
          unit: string
        }
        Insert: {
          aliases?: string[] | null
          created_at?: string
          id?: string
          name: string
          unit: string
        }
        Update: {
          aliases?: string[] | null
          created_at?: string
          id?: string
          name?: string
          unit?: string
        }
        Relationships: []
      }
      master_works: {
        Row: {
          aliases: string[] | null
          created_at: string
          id: string
          name: string
          notes: string | null
          unit: string
        }
        Insert: {
          aliases?: string[] | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          unit: string
        }
        Update: {
          aliases?: string[] | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          unit?: string
        }
        Relationships: []
      }
      material_receipts: {
        Row: {
          boq_code: string | null
          boq_item_id: string | null
          created_at: string
          created_by: string | null
          id: string
          import_hash: string | null
          invoice_url: string | null
          master_material_id: string | null
          material_name: string
          nakladnoy_no: string | null
          pdf_url: string | null
          photo_url: string | null
          project_id: string
          qty: number
          receipt_group_id: string | null
          received_at: string
          source: string | null
          source_note: string | null
          supplier_id: string | null
          supplier_name: string | null
          telegram_user_id: number | null
          total_price: number | null
          unit: string | null
          unit_price: number
          waybill_url: string | null
          zayavka_id: string | null
        }
        Insert: {
          boq_code?: string | null
          boq_item_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          import_hash?: string | null
          invoice_url?: string | null
          master_material_id?: string | null
          material_name: string
          nakladnoy_no?: string | null
          pdf_url?: string | null
          photo_url?: string | null
          project_id: string
          qty: number
          receipt_group_id?: string | null
          received_at?: string
          source?: string | null
          source_note?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          telegram_user_id?: number | null
          total_price?: number | null
          unit?: string | null
          unit_price: number
          waybill_url?: string | null
          zayavka_id?: string | null
        }
        Update: {
          boq_code?: string | null
          boq_item_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          import_hash?: string | null
          invoice_url?: string | null
          master_material_id?: string | null
          material_name?: string
          nakladnoy_no?: string | null
          pdf_url?: string | null
          photo_url?: string | null
          project_id?: string
          qty?: number
          receipt_group_id?: string | null
          received_at?: string
          source?: string | null
          source_note?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          telegram_user_id?: number | null
          total_price?: number | null
          unit?: string | null
          unit_price?: number
          waybill_url?: string | null
          zayavka_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_receipts_boq_item_id_fkey"
            columns: ["boq_item_id"]
            isOneToOne: false
            referencedRelation: "boq_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_receipts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_receipts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mr_boq_item_fk"
            columns: ["boq_item_id"]
            isOneToOne: false
            referencedRelation: "boq_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mr_master_material_fk"
            columns: ["master_material_id"]
            isOneToOne: false
            referencedRelation: "master_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mr_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mr_supplier_fk"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mr_zayavka_fk"
            columns: ["zayavka_id"]
            isOneToOne: false
            referencedRelation: "project_zayavka"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mr_zayavka_fk"
            columns: ["zayavka_id"]
            isOneToOne: false
            referencedRelation: "v_master_zayavka_remaining"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mr_zayavka_fk"
            columns: ["zayavka_id"]
            isOneToOne: false
            referencedRelation: "warehouse_balance"
            referencedColumns: ["zayavka_id"]
          },
        ]
      }
      material_usage: {
        Row: {
          boq_code: string | null
          boq_item_id: string | null
          brigade_id: string | null
          brigade_name: string | null
          created_at: string
          created_by: string | null
          id: string
          master_material_id: string | null
          material_name: string
          note: string | null
          project_id: string
          qty: number
          telegram_user_id: number | null
          unit: string | null
          unit_price: number | null
          used_at: string
          used_for: string | null
          zayavka_id: string | null
        }
        Insert: {
          boq_code?: string | null
          boq_item_id?: string | null
          brigade_id?: string | null
          brigade_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          master_material_id?: string | null
          material_name: string
          note?: string | null
          project_id: string
          qty?: number
          telegram_user_id?: number | null
          unit?: string | null
          unit_price?: number | null
          used_at?: string
          used_for?: string | null
          zayavka_id?: string | null
        }
        Update: {
          boq_code?: string | null
          boq_item_id?: string | null
          brigade_id?: string | null
          brigade_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          master_material_id?: string | null
          material_name?: string
          note?: string | null
          project_id?: string
          qty?: number
          telegram_user_id?: number | null
          unit?: string | null
          unit_price?: number | null
          used_at?: string
          used_for?: string | null
          zayavka_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mu_boq_item_fk"
            columns: ["boq_item_id"]
            isOneToOne: false
            referencedRelation: "boq_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mu_brigade_fk"
            columns: ["brigade_id"]
            isOneToOne: false
            referencedRelation: "brigades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mu_master_material_fk"
            columns: ["master_material_id"]
            isOneToOne: false
            referencedRelation: "master_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mu_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mu_zayavka_fk"
            columns: ["zayavka_id"]
            isOneToOne: false
            referencedRelation: "project_zayavka"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mu_zayavka_fk"
            columns: ["zayavka_id"]
            isOneToOne: false
            referencedRelation: "v_master_zayavka_remaining"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mu_zayavka_fk"
            columns: ["zayavka_id"]
            isOneToOne: false
            referencedRelation: "warehouse_balance"
            referencedColumns: ["zayavka_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          firm_id: string | null
          full_name: string | null
          id: string
          is_active: boolean
          phone: string | null
          telegram_user_id: number | null
          telegram_username: string | null
        }
        Insert: {
          created_at?: string
          firm_id?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          phone?: string | null
          telegram_user_id?: number | null
          telegram_username?: string | null
        }
        Update: {
          created_at?: string
          firm_id?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          telegram_user_id?: number | null
          telegram_username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      project_zayavka: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          boq_item_id: string | null
          ceo_at: string | null
          ceo_note: string | null
          ceo_status: string | null
          contract_url: string | null
          created_at: string
          created_by: string | null
          excel_url: string | null
          id: string
          invoice_date: string | null
          invoice_no: string | null
          invoice_url: string | null
          kind: Database["public"]["Enums"]["zayavka_kind"]
          master_material_id: string | null
          master_work_id: string | null
          name: string
          needed_date: string | null
          notes: string | null
          off_plan: boolean
          paid_amount: number
          paid_at: string | null
          parent_id: string | null
          payment_proof_url: string | null
          project_id: string
          qty: number
          qty_received: number
          rejected_reason: string | null
          status: Database["public"]["Enums"]["zayavka_status"]
          subkind: string | null
          submitted_at: string | null
          supplier_id: string | null
          supplier_name: string | null
          telegram_user_id: number | null
          total: number | null
          unit: string
          unit_price: number
          waybill_no: string | null
          waybill_received_at: string | null
          waybill_url: string | null
          workflow_status: Database["public"]["Enums"]["zayavka_workflow_status"]
          zayavka_no: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          boq_item_id?: string | null
          ceo_at?: string | null
          ceo_note?: string | null
          ceo_status?: string | null
          contract_url?: string | null
          created_at?: string
          created_by?: string | null
          excel_url?: string | null
          id?: string
          invoice_date?: string | null
          invoice_no?: string | null
          invoice_url?: string | null
          kind: Database["public"]["Enums"]["zayavka_kind"]
          master_material_id?: string | null
          master_work_id?: string | null
          name: string
          needed_date?: string | null
          notes?: string | null
          off_plan?: boolean
          paid_amount?: number
          paid_at?: string | null
          parent_id?: string | null
          payment_proof_url?: string | null
          project_id: string
          qty?: number
          qty_received?: number
          rejected_reason?: string | null
          status?: Database["public"]["Enums"]["zayavka_status"]
          subkind?: string | null
          submitted_at?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          telegram_user_id?: number | null
          total?: number | null
          unit: string
          unit_price?: number
          waybill_no?: string | null
          waybill_received_at?: string | null
          waybill_url?: string | null
          workflow_status?: Database["public"]["Enums"]["zayavka_workflow_status"]
          zayavka_no?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          boq_item_id?: string | null
          ceo_at?: string | null
          ceo_note?: string | null
          ceo_status?: string | null
          contract_url?: string | null
          created_at?: string
          created_by?: string | null
          excel_url?: string | null
          id?: string
          invoice_date?: string | null
          invoice_no?: string | null
          invoice_url?: string | null
          kind?: Database["public"]["Enums"]["zayavka_kind"]
          master_material_id?: string | null
          master_work_id?: string | null
          name?: string
          needed_date?: string | null
          notes?: string | null
          off_plan?: boolean
          paid_amount?: number
          paid_at?: string | null
          parent_id?: string | null
          payment_proof_url?: string | null
          project_id?: string
          qty?: number
          qty_received?: number
          rejected_reason?: string | null
          status?: Database["public"]["Enums"]["zayavka_status"]
          subkind?: string | null
          submitted_at?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          telegram_user_id?: number | null
          total?: number | null
          unit?: string
          unit_price?: number
          waybill_no?: string | null
          waybill_received_at?: string | null
          waybill_url?: string | null
          workflow_status?: Database["public"]["Enums"]["zayavka_workflow_status"]
          zayavka_no?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_zayavka_boq_item_id_fkey"
            columns: ["boq_item_id"]
            isOneToOne: false
            referencedRelation: "boq_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_zayavka_master_material_id_fkey"
            columns: ["master_material_id"]
            isOneToOne: false
            referencedRelation: "master_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_zayavka_master_work_id_fkey"
            columns: ["master_work_id"]
            isOneToOne: false
            referencedRelation: "master_works"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_zayavka_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "project_zayavka"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_zayavka_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_master_zayavka_remaining"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_zayavka_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "warehouse_balance"
            referencedColumns: ["zayavka_id"]
          },
          {
            foreignKeyName: "pz_boq_item_fk"
            columns: ["boq_item_id"]
            isOneToOne: false
            referencedRelation: "boq_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pz_master_material_fk"
            columns: ["master_material_id"]
            isOneToOne: false
            referencedRelation: "master_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pz_master_work_fk"
            columns: ["master_work_id"]
            isOneToOne: false
            referencedRelation: "master_works"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pz_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pz_supplier_fk"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      project_zayavka_items: {
        Row: {
          created_at: string
          id: string
          line_no: number
          location: string | null
          name: string
          notes: string | null
          qty: number
          unit: string
          zayavka_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          line_no?: number
          location?: string | null
          name: string
          notes?: string | null
          qty?: number
          unit?: string
          zayavka_id: string
        }
        Update: {
          created_at?: string
          id?: string
          line_no?: number
          location?: string | null
          name?: string
          notes?: string | null
          qty?: number
          unit?: string
          zayavka_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_zayavka_items_zayavka_id_fkey"
            columns: ["zayavka_id"]
            isOneToOne: false
            referencedRelation: "project_zayavka"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_zayavka_items_zayavka_id_fkey"
            columns: ["zayavka_id"]
            isOneToOne: false
            referencedRelation: "v_master_zayavka_remaining"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_zayavka_items_zayavka_id_fkey"
            columns: ["zayavka_id"]
            isOneToOne: false
            referencedRelation: "warehouse_balance"
            referencedColumns: ["zayavka_id"]
          },
        ]
      }
      projects: {
        Row: {
          code: string
          created_at: string
          end_date: string | null
          firm_id: string | null
          geo_lat: number | null
          geo_lng: number | null
          geo_radius_m: number
          id: string
          location: string | null
          name: string
          pm_name: string | null
          prorab_name: string | null
          start_date: string | null
          status: string | null
          total_budget: number | null
        }
        Insert: {
          code: string
          created_at?: string
          end_date?: string | null
          firm_id?: string | null
          geo_lat?: number | null
          geo_lng?: number | null
          geo_radius_m?: number
          id?: string
          location?: string | null
          name: string
          pm_name?: string | null
          prorab_name?: string | null
          start_date?: string | null
          status?: string | null
          total_budget?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          end_date?: string | null
          firm_id?: string | null
          geo_lat?: number | null
          geo_lng?: number | null
          geo_radius_m?: number
          id?: string
          location?: string | null
          name?: string
          pm_name?: string | null
          prorab_name?: string | null
          start_date?: string | null
          status?: string | null
          total_budget?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          path: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          path: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          path?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      supplier_contracts: {
        Row: {
          amount: number | null
          contract_date: string | null
          contract_no: string | null
          created_at: string
          file_url: string | null
          firm_id: string | null
          id: string
          note: string | null
          supplier_id: string
          supplier_name: string | null
        }
        Insert: {
          amount?: number | null
          contract_date?: string | null
          contract_no?: string | null
          created_at?: string
          file_url?: string | null
          firm_id?: string | null
          id?: string
          note?: string | null
          supplier_id: string
          supplier_name?: string | null
        }
        Update: {
          amount?: number | null
          contract_date?: string | null
          contract_no?: string | null
          created_at?: string
          file_url?: string | null
          firm_id?: string | null
          id?: string
          note?: string | null
          supplier_id?: string
          supplier_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_contracts_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contracts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          contact: string | null
          created_at: string
          firm_id: string | null
          id: string
          inn: string | null
          name: string
          phone: string | null
        }
        Insert: {
          contact?: string | null
          created_at?: string
          firm_id?: string | null
          id?: string
          inn?: string | null
          name: string
          phone?: string | null
        }
        Update: {
          contact?: string | null
          created_at?: string
          firm_id?: string | null
          id?: string
          inn?: string | null
          name?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_sessions: {
        Row: {
          chat_id: number
          data: Json
          flow: string | null
          step: string | null
          telegram_user_id: number
          updated_at: string
          username: string | null
        }
        Insert: {
          chat_id: number
          data?: Json
          flow?: string | null
          step?: string | null
          telegram_user_id: number
          updated_at?: string
          username?: string | null
        }
        Update: {
          chat_id?: number
          data?: Json
          flow?: string | null
          step?: string | null
          telegram_user_id?: number
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      user_firm_access: {
        Row: {
          created_at: string
          firm_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          firm_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          firm_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_firm_access_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      user_project_access: {
        Row: {
          created_at: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_project_access_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      variations: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          attachment_url: string | null
          boq_code: string | null
          boq_item_id: string | null
          created_at: string
          id: string
          project_id: string
          qty: number | null
          reason: string | null
          requested_by: string | null
          requested_by_name: string | null
          status: Database["public"]["Enums"]["variation_status"]
          telegram_user_id: number | null
          title: string
          unit: string | null
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          boq_code?: string | null
          boq_item_id?: string | null
          created_at?: string
          id?: string
          project_id: string
          qty?: number | null
          reason?: string | null
          requested_by?: string | null
          requested_by_name?: string | null
          status?: Database["public"]["Enums"]["variation_status"]
          telegram_user_id?: number | null
          title: string
          unit?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          boq_code?: string | null
          boq_item_id?: string | null
          created_at?: string
          id?: string
          project_id?: string
          qty?: number | null
          reason?: string | null
          requested_by?: string | null
          requested_by_name?: string | null
          status?: Database["public"]["Enums"]["variation_status"]
          telegram_user_id?: number | null
          title?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "variations_boq_item_id_fkey"
            columns: ["boq_item_id"]
            isOneToOne: false
            referencedRelation: "boq_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      work_progress: {
        Row: {
          boq_code: string | null
          boq_item_id: string | null
          brigade_id: string | null
          brigade_name: string | null
          created_at: string
          created_by: string | null
          id: string
          import_hash: string | null
          master_work_id: string | null
          photo_url: string | null
          project_id: string
          qty_done: number
          source: string | null
          source_note: string | null
          telegram_user_id: number | null
          total_value: number | null
          unit: string | null
          unit_price: number | null
          work_date: string
          work_type: string
          zayavka_id: string | null
        }
        Insert: {
          boq_code?: string | null
          boq_item_id?: string | null
          brigade_id?: string | null
          brigade_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          import_hash?: string | null
          master_work_id?: string | null
          photo_url?: string | null
          project_id: string
          qty_done: number
          source?: string | null
          source_note?: string | null
          telegram_user_id?: number | null
          total_value?: number | null
          unit?: string | null
          unit_price?: number | null
          work_date?: string
          work_type: string
          zayavka_id?: string | null
        }
        Update: {
          boq_code?: string | null
          boq_item_id?: string | null
          brigade_id?: string | null
          brigade_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          import_hash?: string | null
          master_work_id?: string | null
          photo_url?: string | null
          project_id?: string
          qty_done?: number
          source?: string | null
          source_note?: string | null
          telegram_user_id?: number | null
          total_value?: number | null
          unit?: string | null
          unit_price?: number | null
          work_date?: string
          work_type?: string
          zayavka_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_progress_boq_item_id_fkey"
            columns: ["boq_item_id"]
            isOneToOne: false
            referencedRelation: "boq_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_progress_brigade_id_fkey"
            columns: ["brigade_id"]
            isOneToOne: false
            referencedRelation: "brigades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_progress_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_boq_item_fk"
            columns: ["boq_item_id"]
            isOneToOne: false
            referencedRelation: "boq_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_brigade_fk"
            columns: ["brigade_id"]
            isOneToOne: false
            referencedRelation: "brigades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_master_work_fk"
            columns: ["master_work_id"]
            isOneToOne: false
            referencedRelation: "master_works"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_zayavka_fk"
            columns: ["zayavka_id"]
            isOneToOne: false
            referencedRelation: "project_zayavka"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_zayavka_fk"
            columns: ["zayavka_id"]
            isOneToOne: false
            referencedRelation: "v_master_zayavka_remaining"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wp_zayavka_fk"
            columns: ["zayavka_id"]
            isOneToOne: false
            referencedRelation: "warehouse_balance"
            referencedColumns: ["zayavka_id"]
          },
        ]
      }
      zayavka_status_log: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status: string | null
          id: string
          note: string | null
          to_status: string
          zayavka_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          to_status: string
          zayavka_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          to_status?: string
          zayavka_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zayavka_status_log_zayavka_id_fkey"
            columns: ["zayavka_id"]
            isOneToOne: false
            referencedRelation: "project_zayavka"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zayavka_status_log_zayavka_id_fkey"
            columns: ["zayavka_id"]
            isOneToOne: false
            referencedRelation: "v_master_zayavka_remaining"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zayavka_status_log_zayavka_id_fkey"
            columns: ["zayavka_id"]
            isOneToOne: false
            referencedRelation: "warehouse_balance"
            referencedColumns: ["zayavka_id"]
          },
        ]
      }
    }
    Views: {
      v_master_zayavka_remaining: {
        Row: {
          id: string | null
          kind: Database["public"]["Enums"]["zayavka_kind"] | null
          name: string | null
          planned_qty: number | null
          project_id: string | null
          received_qty: number | null
          remaining_qty: number | null
          requested_qty: number | null
          unit: string | null
          unit_price: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pz_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      v_security_audit: {
        Row: {
          permissive_write_policies: number | null
          policy_count: number | null
          rls_enabled: boolean | null
          status: string | null
          table_name: unknown
        }
        Relationships: []
      }
      v_security_definer_grants: {
        Row: {
          arguments: string | null
          function_name: unknown
          grants: string[] | null
        }
        Relationships: []
      }
      warehouse_balance: {
        Row: {
          kind: Database["public"]["Enums"]["zayavka_kind"] | null
          name: string | null
          planned_qty: number | null
          planned_total: number | null
          planned_unit_price: number | null
          project_id: string | null
          received_qty: number | null
          received_total: number | null
          remaining_qty: number | null
          status: string | null
          unit: string | null
          zayavka_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pz_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_trigger_error: {
        Args: {
          _action: string
          _err_context: string
          _err_message: string
          _err_sqlstate: string
          _record_id: string
          _table_name: string
        }
        Returns: undefined
      }
      norm_name: { Args: { s: string }; Returns: string }
      recompute_zayavka_progress: { Args: { _zid: string }; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      tg_user_has_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"]; _tg_id: number }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "project_manager"
        | "accountant"
        | "storekeeper"
        | "foreman"
        | "viewer"
        | "prorab"
        | "snabjenec"
        | "buxgalter"
        | "direktor"
        | "taminotchi"
        | "omborchi"
        | "pm"
        | "ceo"
        | "finans"
        | "kuzatuvchi"
      brigade_payment_kind: "avans" | "yakuniy" | "boshqa"
      employee_payment_kind: "avans" | "bonus" | "oylik" | "boshqa"
      payment_method: "Naqd" | "Bank" | "Karta"
      po_approval_status: "pending" | "approved" | "rejected"
      po_payment_type: "cash" | "bank_transfer"
      variation_status: "Pending" | "Approved" | "Rejected"
      zayavka_kind: "material" | "work" | "equipment" | "extra"
      zayavka_status: "approved" | "pending" | "rejected"
      zayavka_workflow_status:
        | "draft"
        | "submitted"
        | "approved"
        | "ordered"
        | "delivered"
        | "invoiced"
        | "waiting_ceo"
        | "paid"
        | "rejected"
        | "pending_pm"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
        "admin",
        "project_manager",
        "accountant",
        "storekeeper",
        "foreman",
        "viewer",
        "prorab",
        "snabjenec",
        "buxgalter",
        "direktor",
        "taminotchi",
        "omborchi",
        "pm",
        "ceo",
        "finans",
        "kuzatuvchi",
      ],
      brigade_payment_kind: ["avans", "yakuniy", "boshqa"],
      employee_payment_kind: ["avans", "bonus", "oylik", "boshqa"],
      payment_method: ["Naqd", "Bank", "Karta"],
      po_approval_status: ["pending", "approved", "rejected"],
      po_payment_type: ["cash", "bank_transfer"],
      variation_status: ["Pending", "Approved", "Rejected"],
      zayavka_kind: ["material", "work", "equipment", "extra"],
      zayavka_status: ["approved", "pending", "rejected"],
      zayavka_workflow_status: [
        "draft",
        "submitted",
        "approved",
        "ordered",
        "delivered",
        "invoiced",
        "waiting_ceo",
        "paid",
        "rejected",
        "pending_pm",
      ],
    },
  },
} as const
