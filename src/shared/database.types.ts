
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "activity_length": {
                  Row: {
                    "id": string,"kind": Database["public"]['Enums']["activity_kind"],"minutes": number,"residency_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"kind": Database["public"]['Enums']["activity_kind"],"minutes": number,"residency_id": string,"updated_at"?: string
                  }
                  Update: {
                    "id"?: string,"kind"?: Database["public"]['Enums']["activity_kind"],"minutes"?: number,"residency_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_length_residency_id_fkey"
      columns: ["residency_id"]
isOneToOne: false
      referencedRelation: "residency"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"after": Json | null,"at": string,"before": Json | null,"id": number,"row_id": string,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"after"?: Json | null,"at"?: string,"before"?: Json | null,"id"?: never,"row_id": string,"table_name": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"after"?: Json | null,"at"?: string,"before"?: Json | null,"id"?: never,"row_id"?: string,"table_name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"calendar_export": {
                  Row: {
                    "created_at": string,"generated_at": string | null,"generated_by": string | null,"id": string,"month": string,"partner_feedback": string | null,"residency_id": string,"reviewed_at": string | null,"reviewed_by": string | null,"sent_at": string | null,"site_id": string,"state": Database["public"]['Enums']["calendar_state"],"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"generated_at"?: string | null,"generated_by"?: string | null,"id"?: string,"month": string,"partner_feedback"?: string | null,"residency_id": string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sent_at"?: string | null,"site_id": string,"state": Database["public"]['Enums']["calendar_state"],"version": number
                  }
                  Update: {
                    "created_at"?: string,"generated_at"?: string | null,"generated_by"?: string | null,"id"?: string,"month"?: string,"partner_feedback"?: string | null,"residency_id"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sent_at"?: string | null,"site_id"?: string,"state"?: Database["public"]['Enums']["calendar_state"],"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "calendar_export_generated_by_fkey"
      columns: ["generated_by"]
isOneToOne: false
      referencedRelation: "person"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "calendar_export_residency_id_fkey"
      columns: ["residency_id"]
isOneToOne: false
      referencedRelation: "residency"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "calendar_export_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "person"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "calendar_export_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "site"
      referencedColumns: ["id"]
    }
                  ]
                },"calendar_feed": {
                  Row: {
                    "created_at": string,"person_id": string,"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"person_id": string,"token"?: string
                  }
                  Update: {
                    "created_at"?: string,"person_id"?: string,"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "calendar_feed_person_id_fkey"
      columns: ["person_id"]
isOneToOne: true
      referencedRelation: "person"
      referencedColumns: ["id"]
    }
                  ]
                },"change_request": {
                  Row: {
                    "created_at": string,"decided_at": string | null,"decided_by": string | null,"decision_note": string | null,"id": string,"kind": string,"note": string | null,"proposed_person_id": string | null,"requested_by": string,"session_id": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"id"?: string,"kind": string,"note"?: string | null,"proposed_person_id"?: string | null,"requested_by": string,"session_id": string,"status"?: string
                  }
                  Update: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"id"?: string,"kind"?: string,"note"?: string | null,"proposed_person_id"?: string | null,"requested_by"?: string,"session_id"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "change_request_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "person"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "change_request_proposed_person_id_fkey"
      columns: ["proposed_person_id"]
isOneToOne: false
      referencedRelation: "person"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "change_request_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "person"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "change_request_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "session"
      referencedColumns: ["id"]
    }
                  ]
                },"contract": {
                  Row: {
                    "estimated_weekly_hours": number | null,"hourly_rate": number,"id": string,"person_id": string,"season_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "estimated_weekly_hours"?: number | null,"hourly_rate": number,"id"?: string,"person_id": string,"season_id": string,"updated_at"?: string
                  }
                  Update: {
                    "estimated_weekly_hours"?: number | null,"hourly_rate"?: number,"id"?: string,"person_id"?: string,"season_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contract_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "person"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contract_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "season"
      referencedColumns: ["id"]
    }
                  ]
                },"custom_invoice": {
                  Row: {
                    "bill_to": string,"created_at": string,"id": string,"invoice_date": string,"lines": NonNullable<Json>,"number": string,"paid_at": string | null,"residency_id": string | null,"sent_at": string | null,"state": string,"title": string,"total": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bill_to": string,"created_at"?: string,"id"?: string,"invoice_date"?: string,"lines"?: NonNullable<Json>,"number": string,"paid_at"?: string | null,"residency_id"?: string | null,"sent_at"?: string | null,"state"?: string,"title": string,"total"?: number,"updated_at"?: string
                  }
                  Update: {
                    "bill_to"?: string,"created_at"?: string,"id"?: string,"invoice_date"?: string,"lines"?: NonNullable<Json>,"number"?: string,"paid_at"?: string | null,"residency_id"?: string | null,"sent_at"?: string | null,"state"?: string,"title"?: string,"total"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "custom_invoice_residency_id_fkey"
      columns: ["residency_id"]
isOneToOne: false
      referencedRelation: "residency"
      referencedColumns: ["id"]
    }
                  ]
                },"interaction_type": {
                  Row: {
                    "active": boolean,"description": string | null,"id": string,"model_type": Database["public"]['Enums']["model_type"] | null,"name": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"description"?: string | null,"id"?: string,"model_type"?: Database["public"]['Enums']["model_type"] | null,"name": string,"sort_order"?: number
                  }
                  Update: {
                    "active"?: boolean,"description"?: string | null,"id"?: string,"model_type"?: Database["public"]['Enums']["model_type"] | null,"name"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"location": {
                  Row: {
                    "active": boolean,"created_at": string,"display_name": string,"id": string,"name": string,"site_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"display_name": string,"id"?: string,"name": string,"site_id": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"display_name"?: string,"id"?: string,"name"?: string,"site_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "location_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "site"
      referencedColumns: ["id"]
    }
                  ]
                },"monthly_reflection": {
                  Row: {
                    "challenges": string,"highlights": string,"id": string,"month": string,"person_id": string,"residency_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "challenges"?: string,"highlights"?: string,"id"?: string,"month": string,"person_id": string,"residency_id": string,"updated_at"?: string
                  }
                  Update: {
                    "challenges"?: string,"highlights"?: string,"id"?: string,"month"?: string,"person_id"?: string,"residency_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "monthly_reflection_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "person"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "monthly_reflection_residency_id_fkey"
      columns: ["residency_id"]
isOneToOne: false
      referencedRelation: "residency"
      referencedColumns: ["id"]
    }
                  ]
                },"notification": {
                  Row: {
                    "attempts": number,"body": string,"created_at": string,"dedupe_key": string | null,"delivery": string | null,"email": string,"error": string | null,"id": string,"kind": string,"person_id": string,"sent_at": string | null,"subject": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"body": string,"created_at"?: string,"dedupe_key"?: string | null,"delivery"?: string | null,"email": string,"error"?: string | null,"id"?: string,"kind": string,"person_id": string,"sent_at"?: string | null,"subject": string
                  }
                  Update: {
                    "attempts"?: number,"body"?: string,"created_at"?: string,"dedupe_key"?: string | null,"delivery"?: string | null,"email"?: string,"error"?: string | null,"id"?: string,"kind"?: string,"person_id"?: string,"sent_at"?: string | null,"subject"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "person"
      referencedColumns: ["id"]
    }
                  ]
                },"partner": {
                  Row: {
                    "active": boolean,"billing_address": string | null,"billing_email": string | null,"created_at": string,"display_name": string,"id": string,"legal_name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"billing_address"?: string | null,"billing_email"?: string | null,"created_at"?: string,"display_name": string,"id"?: string,"legal_name": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"billing_address"?: string | null,"billing_email"?: string | null,"created_at"?: string,"display_name"?: string,"id"?: string,"legal_name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"partner_agreement": {
                  Row: {
                    "bill_late_cancellations": boolean,"bill_stipends": boolean,"billing_basis": Database["public"]['Enums']["billing_basis"],"contracted_hours": number | null,"created_at": string,"hourly_rate": number | null,"id": string,"name": string,"overhead_billing": Database["public"]['Enums']["overhead_billing"],"overhead_percent": number | null,"residency_id": string,"season_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bill_late_cancellations"?: boolean,"bill_stipends"?: boolean,"billing_basis"?: Database["public"]['Enums']["billing_basis"],"contracted_hours"?: number | null,"created_at"?: string,"hourly_rate"?: number | null,"id"?: string,"name": string,"overhead_billing"?: Database["public"]['Enums']["overhead_billing"],"overhead_percent"?: number | null,"residency_id": string,"season_id": string,"updated_at"?: string
                  }
                  Update: {
                    "bill_late_cancellations"?: boolean,"bill_stipends"?: boolean,"billing_basis"?: Database["public"]['Enums']["billing_basis"],"contracted_hours"?: number | null,"created_at"?: string,"hourly_rate"?: number | null,"id"?: string,"name"?: string,"overhead_billing"?: Database["public"]['Enums']["overhead_billing"],"overhead_percent"?: number | null,"residency_id"?: string,"season_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "partner_agreement_residency_id_fkey"
      columns: ["residency_id"]
isOneToOne: false
      referencedRelation: "residency"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "partner_agreement_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "season"
      referencedColumns: ["id"]
    }
                  ]
                },"partner_agreement_site": {
                  Row: {
                    "agreement_id": string,"site_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agreement_id": string,"site_id": string
                  }
                  Update: {
                    "agreement_id"?: string,"site_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "partner_agreement_site_agreement_id_fkey"
      columns: ["agreement_id"]
isOneToOne: false
      referencedRelation: "partner_agreement"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "partner_agreement_site_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "site"
      referencedColumns: ["id"]
    }
                  ]
                },"partner_contact": {
                  Row: {
                    "active": boolean,"created_at": string,"email": string | null,"id": string,"name": string,"partner_id": string,"phone": string | null,"receives": (string)[],"title": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"email"?: string | null,"id"?: string,"name": string,"partner_id": string,"phone"?: string | null,"receives"?: (string)[],"title"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"email"?: string | null,"id"?: string,"name"?: string,"partner_id"?: string,"phone"?: string | null,"receives"?: (string)[],"title"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "partner_contact_partner_id_fkey"
      columns: ["partner_id"]
isOneToOne: false
      referencedRelation: "partner"
      referencedColumns: ["id"]
    }
                  ]
                },"partner_contact_site": {
                  Row: {
                    "contact_id": string,"site_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "contact_id": string,"site_id": string
                  }
                  Update: {
                    "contact_id"?: string,"site_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "partner_contact_site_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "partner_contact"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "partner_contact_site_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "site"
      referencedColumns: ["id"]
    }
                  ]
                },"partner_installment": {
                  Row: {
                    "agreement_id": string,"amount": number,"due_on": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agreement_id": string,"amount": number,"due_on": string,"id"?: string
                  }
                  Update: {
                    "agreement_id"?: string,"amount"?: number,"due_on"?: string,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "partner_installment_agreement_id_fkey"
      columns: ["agreement_id"]
isOneToOne: false
      referencedRelation: "partner_agreement"
      referencedColumns: ["id"]
    }
                  ]
                },"partner_invoice": {
                  Row: {
                    "agreement_id": string,"bill_to": string,"id": string,"kind": Database["public"]['Enums']["partner_invoice_kind"],"lines": NonNullable<Json>,"month": string,"number": string,"paid_at": string | null,"sent_at": string,"site_id": string | null,"state": Database["public"]['Enums']["partner_invoice_state"],"summary": NonNullable<Json>,"total": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agreement_id": string,"bill_to": string,"id"?: string,"kind": Database["public"]['Enums']["partner_invoice_kind"],"lines": NonNullable<Json>,"month": string,"number": string,"paid_at"?: string | null,"sent_at"?: string,"site_id"?: string | null,"state"?: Database["public"]['Enums']["partner_invoice_state"],"summary"?: NonNullable<Json>,"total": number,"updated_at"?: string
                  }
                  Update: {
                    "agreement_id"?: string,"bill_to"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["partner_invoice_kind"],"lines"?: NonNullable<Json>,"month"?: string,"number"?: string,"paid_at"?: string | null,"sent_at"?: string,"site_id"?: string | null,"state"?: Database["public"]['Enums']["partner_invoice_state"],"summary"?: NonNullable<Json>,"total"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "partner_invoice_agreement_id_fkey"
      columns: ["agreement_id"]
isOneToOne: false
      referencedRelation: "partner_agreement"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "partner_invoice_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "site"
      referencedColumns: ["id"]
    }
                  ]
                },"partner_invoice_choice": {
                  Row: {
                    "agreement_id": string,"excluded_stipend_ids": (string)[],"id": string,"month": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agreement_id": string,"excluded_stipend_ids"?: (string)[],"id"?: string,"month": string,"updated_at"?: string
                  }
                  Update: {
                    "agreement_id"?: string,"excluded_stipend_ids"?: (string)[],"id"?: string,"month"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "partner_invoice_choice_agreement_id_fkey"
      columns: ["agreement_id"]
isOneToOne: false
      referencedRelation: "partner_agreement"
      referencedColumns: ["id"]
    }
                  ]
                },"person": {
                  Row: {
                    "active": boolean,"certified_on": string | null,"created_at": string,"email": string,"employment_type": Database["public"]['Enums']["employment_type"],"id": string,"instruments": (string)[],"invited_at": string | null,"job_title": string | null,"name": string,"phone": string | null,"system_roles": (Database["public"]['Enums']["system_role"])[],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"certified_on"?: string | null,"created_at"?: string,"email": string,"employment_type": Database["public"]['Enums']["employment_type"],"id": string,"instruments"?: (string)[],"invited_at"?: string | null,"job_title"?: string | null,"name": string,"phone"?: string | null,"system_roles"?: (Database["public"]['Enums']["system_role"])[],"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"certified_on"?: string | null,"created_at"?: string,"email"?: string,"employment_type"?: Database["public"]['Enums']["employment_type"],"id"?: string,"instruments"?: (string)[],"invited_at"?: string | null,"job_title"?: string | null,"name"?: string,"phone"?: string | null,"system_roles"?: (Database["public"]['Enums']["system_role"])[],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"relationship_activity": {
                  Row: {
                    "collaborative": boolean,"created_at": string,"end_time": string | null,"id": string,"kind": Database["public"]['Enums']["activity_kind"],"minutes": number,"note": string | null,"occurred_on": string,"person_id": string,"residency_id": string,"session_id": string | null,"site_id": string,"start_time": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "collaborative"?: boolean,"created_at"?: string,"end_time"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["activity_kind"],"minutes": number,"note"?: string | null,"occurred_on": string,"person_id": string,"residency_id": string,"session_id"?: string | null,"site_id": string,"start_time"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "collaborative"?: boolean,"created_at"?: string,"end_time"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["activity_kind"],"minutes"?: number,"note"?: string | null,"occurred_on"?: string,"person_id"?: string,"residency_id"?: string,"session_id"?: string | null,"site_id"?: string,"start_time"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "relationship_activity_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "person"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "relationship_activity_residency_id_fkey"
      columns: ["residency_id"]
isOneToOne: false
      referencedRelation: "residency"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "relationship_activity_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "session"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "relationship_activity_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "site"
      referencedColumns: ["id"]
    }
                  ]
                },"relationship_activity_musician": {
                  Row: {
                    "activity_id": string,"person_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_id": string,"person_id": string
                  }
                  Update: {
                    "activity_id"?: string,"person_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "relationship_activity_musician_activity_id_fkey"
      columns: ["activity_id"]
isOneToOne: false
      referencedRelation: "relationship_activity"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "relationship_activity_musician_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "person"
      referencedColumns: ["id"]
    }
                  ]
                },"relationship_activity_resident": {
                  Row: {
                    "activity_id": string,"resident_id": string,"room": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_id": string,"resident_id": string,"room"?: string | null
                  }
                  Update: {
                    "activity_id"?: string,"resident_id"?: string,"room"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "relationship_activity_resident_activity_id_fkey"
      columns: ["activity_id"]
isOneToOne: false
      referencedRelation: "relationship_activity"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "relationship_activity_resident_resident_id_fkey"
      columns: ["resident_id"]
isOneToOne: false
      referencedRelation: "resident"
      referencedColumns: ["id"]
    }
                  ]
                },"residency": {
                  Row: {
                    "created_at": string,"display_name": string,"ended_on": string | null,"id": string,"name": string,"partner_id": string,"started_on": string | null,"status": Database["public"]['Enums']["residency_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name": string,"ended_on"?: string | null,"id"?: string,"name": string,"partner_id": string,"started_on"?: string | null,"status"?: Database["public"]['Enums']["residency_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"ended_on"?: string | null,"id"?: string,"name"?: string,"partner_id"?: string,"started_on"?: string | null,"status"?: Database["public"]['Enums']["residency_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "residency_partner_id_fkey"
      columns: ["partner_id"]
isOneToOne: false
      referencedRelation: "partner"
      referencedColumns: ["id"]
    }
                  ]
                },"residency_site": {
                  Row: {
                    "residency_id": string,"site_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "residency_id": string,"site_id": string
                  }
                  Update: {
                    "residency_id"?: string,"site_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "residency_site_residency_id_fkey"
      columns: ["residency_id"]
isOneToOne: false
      referencedRelation: "residency"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "residency_site_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "site"
      referencedColumns: ["id"]
    }
                  ]
                },"resident": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"disambiguator": string,"display_name": string,"id": string,"room": string | null,"site_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"disambiguator"?: string,"display_name": string,"id"?: string,"room"?: string | null,"site_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"disambiguator"?: string,"display_name"?: string,"id"?: string,"room"?: string | null,"site_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "resident_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "person"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "resident_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "site"
      referencedColumns: ["id"]
    }
                  ]
                },"resource_link": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"label": string,"sort_order": number,"updated_at": string,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"label": string,"sort_order"?: number,"updated_at"?: string,"url": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"label"?: string,"sort_order"?: number,"updated_at"?: string,"url"?: string
                  }
                  Relationships: [
                    
                  ]
                },"roster_member": {
                  Row: {
                    "created_at": string,"id": string,"is_admin_lead": boolean,"is_core": boolean,"joined_on": string,"left_on": string | null,"person_id": string,"season_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_admin_lead"?: boolean,"is_core"?: boolean,"joined_on"?: string,"left_on"?: string | null,"person_id": string,"season_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_admin_lead"?: boolean,"is_core"?: boolean,"joined_on"?: string,"left_on"?: string | null,"person_id"?: string,"season_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "roster_member_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "person"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "roster_member_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "season"
      referencedColumns: ["id"]
    }
                  ]
                },"schedule_check": {
                  Row: {
                    "changed_at": string | null,"checked_at": string,"id": string,"month": string,"person_id": string,"residency_id": string,"site_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_at"?: string | null,"checked_at"?: string,"id"?: string,"month": string,"person_id": string,"residency_id": string,"site_id": string
                  }
                  Update: {
                    "changed_at"?: string | null,"checked_at"?: string,"id"?: string,"month"?: string,"person_id"?: string,"residency_id"?: string,"site_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "schedule_check_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "person"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_check_residency_id_fkey"
      columns: ["residency_id"]
isOneToOne: false
      referencedRelation: "residency"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_check_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "site"
      referencedColumns: ["id"]
    }
                  ]
                },"schedule_month": {
                  Row: {
                    "confirmed_at": string | null,"confirmed_by": string | null,"final_due_on": string,"finalized_at": string | null,"finalized_by": string | null,"id": string,"month": string,"opened_at": string,"opened_by": string | null,"residency_id": string,"sent_at": string | null,"sent_by": string | null,"site_id": string,"stage": Database["public"]['Enums']["schedule_month_stage"],"team_due_on": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "confirmed_at"?: string | null,"confirmed_by"?: string | null,"final_due_on": string,"finalized_at"?: string | null,"finalized_by"?: string | null,"id"?: string,"month": string,"opened_at"?: string,"opened_by"?: string | null,"residency_id": string,"sent_at"?: string | null,"sent_by"?: string | null,"site_id": string,"stage"?: Database["public"]['Enums']["schedule_month_stage"],"team_due_on": string,"updated_at"?: string
                  }
                  Update: {
                    "confirmed_at"?: string | null,"confirmed_by"?: string | null,"final_due_on"?: string,"finalized_at"?: string | null,"finalized_by"?: string | null,"id"?: string,"month"?: string,"opened_at"?: string,"opened_by"?: string | null,"residency_id"?: string,"sent_at"?: string | null,"sent_by"?: string | null,"site_id"?: string,"stage"?: Database["public"]['Enums']["schedule_month_stage"],"team_due_on"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "schedule_month_confirmed_by_fkey"
      columns: ["confirmed_by"]
isOneToOne: false
      referencedRelation: "person"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_month_finalized_by_fkey"
      columns: ["finalized_by"]
isOneToOne: false
      referencedRelation: "person"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_month_opened_by_fkey"
      columns: ["opened_by"]
isOneToOne: false
      referencedRelation: "person"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_month_residency_id_fkey"
      columns: ["residency_id"]
isOneToOne: false
      referencedRelation: "residency"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_month_sent_by_fkey"
      columns: ["sent_by"]
isOneToOne: false
      referencedRelation: "person"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_month_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "site"
      referencedColumns: ["id"]
    }
                  ]
                },"season": {
                  Row: {
                    "created_at": string,"ends_on": string,"id": string,"kind": Database["public"]['Enums']["season_kind"],"name": string,"residency_id": string,"starts_on": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"ends_on": string,"id"?: string,"kind"?: Database["public"]['Enums']["season_kind"],"name": string,"residency_id": string,"starts_on": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"ends_on"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["season_kind"],"name"?: string,"residency_id"?: string,"starts_on"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "season_residency_id_fkey"
      columns: ["residency_id"]
isOneToOne: false
      referencedRelation: "residency"
      referencedColumns: ["id"]
    }
                  ]
                },"series": {
                  Row: {
                    "active_from": string,"active_until": string | null,"created_at": string,"default_interaction_type_id": string | null,"default_leader_id": string | null,"default_location_id": string,"id": string,"kind": Database["public"]['Enums']["session_kind"],"minutes": number | null,"recurrence": string,"residency_id": string,"skip_weeks_of_month": (number)[],"start_time": string | null,"title": string,"updated_at": string,"week_of_month": number | null,"weekdays": (number)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "active_from": string,"active_until"?: string | null,"created_at"?: string,"default_interaction_type_id"?: string | null,"default_leader_id"?: string | null,"default_location_id": string,"id"?: string,"kind"?: Database["public"]['Enums']["session_kind"],"minutes"?: number | null,"recurrence"?: string,"residency_id": string,"skip_weeks_of_month"?: (number)[],"start_time"?: string | null,"title": string,"updated_at"?: string,"week_of_month"?: number | null,"weekdays": (number)[]
                  }
                  Update: {
                    "active_from"?: string,"active_until"?: string | null,"created_at"?: string,"default_interaction_type_id"?: string | null,"default_leader_id"?: string | null,"default_location_id"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["session_kind"],"minutes"?: number | null,"recurrence"?: string,"residency_id"?: string,"skip_weeks_of_month"?: (number)[],"start_time"?: string | null,"title"?: string,"updated_at"?: string,"week_of_month"?: number | null,"weekdays"?: (number)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "series_default_interaction_type_id_fkey"
      columns: ["default_interaction_type_id"]
isOneToOne: false
      referencedRelation: "interaction_type"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "series_default_leader_id_fkey"
      columns: ["default_leader_id"]
isOneToOne: false
      referencedRelation: "person"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "series_default_location_id_fkey"
      columns: ["default_location_id"]
isOneToOne: false
      referencedRelation: "location"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "series_residency_id_fkey"
      columns: ["residency_id"]
isOneToOne: false
      referencedRelation: "residency"
      referencedColumns: ["id"]
    }
                  ]
                },"series_default_person": {
                  Row: {
                    "person_id": string,"series_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "person_id": string,"series_id": string
                  }
                  Update: {
                    "person_id"?: string,"series_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "series_default_person_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "person"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "series_default_person_series_id_fkey"
      columns: ["series_id"]
isOneToOne: false
      referencedRelation: "series"
      referencedColumns: ["id"]
    }
                  ]
                },"session": {
                  Row: {
                    "billable": boolean,"call_time": string | null,"canceled_at": string | null,"cancellation_reason": Database["public"]['Enums']["cancellation_reason"] | null,"created_at": string,"has_set_time": boolean,"id": string,"internal_note": string | null,"is_extra": boolean,"is_special_event": boolean,"kind": Database["public"]['Enums']["session_kind"],"location_id": string,"public_note": string | null,"residency_id": string,"schedule_state": Database["public"]['Enums']["schedule_state"],"scheduled_minutes": number | null,"series_id": string | null,"starts_at": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "billable"?: boolean,"call_time"?: string | null,"canceled_at"?: string | null,"cancellation_reason"?: Database["public"]['Enums']["cancellation_reason"] | null,"created_at"?: string,"has_set_time"?: boolean,"id"?: string,"internal_note"?: string | null,"is_extra"?: boolean,"is_special_event"?: boolean,"kind"?: Database["public"]['Enums']["session_kind"],"location_id": string,"public_note"?: string | null,"residency_id": string,"schedule_state"?: Database["public"]['Enums']["schedule_state"],"scheduled_minutes"?: number | null,"series_id"?: string | null,"starts_at": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "billable"?: boolean,"call_time"?: string | null,"canceled_at"?: string | null,"cancellation_reason"?: Database["public"]['Enums']["cancellation_reason"] | null,"created_at"?: string,"has_set_time"?: boolean,"id"?: string,"internal_note"?: string | null,"is_extra"?: boolean,"is_special_event"?: boolean,"kind"?: Database["public"]['Enums']["session_kind"],"location_id"?: string,"public_note"?: string | null,"residency_id"?: string,"schedule_state"?: Database["public"]['Enums']["schedule_state"],"scheduled_minutes"?: number | null,"series_id"?: string | null,"starts_at"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "session_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "location"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "session_residency_id_fkey"
      columns: ["residency_id"]
isOneToOne: false
      referencedRelation: "residency"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "session_series_id_fkey"
      columns: ["series_id"]
isOneToOne: false
      referencedRelation: "series"
      referencedColumns: ["id"]
    }
                  ]
                },"session_assignment": {
                  Row: {
                    "created_at": string,"id": string,"person_id": string,"role": Database["public"]['Enums']["assignment_role"],"session_id": string,"status": Database["public"]['Enums']["assignment_status"],"substitute_for_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"person_id": string,"role"?: Database["public"]['Enums']["assignment_role"],"session_id": string,"status"?: Database["public"]['Enums']["assignment_status"],"substitute_for_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"person_id"?: string,"role"?: Database["public"]['Enums']["assignment_role"],"session_id"?: string,"status"?: Database["public"]['Enums']["assignment_status"],"substitute_for_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "session_assignment_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "person"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "session_assignment_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "session"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "session_assignment_substitute_for_id_fkey"
      columns: ["substitute_for_id"]
isOneToOne: false
      referencedRelation: "person"
      referencedColumns: ["id"]
    }
                  ]
                },"session_report": {
                  Row: {
                    "actual_minutes": number,"attendance": number,"author_id": string,"id": string,"interaction_type_id": string,"notes": string | null,"resident_involvement": Database["public"]['Enums']["resident_involvement"],"session_id": string,"site_id": string | null,"submitted_at": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actual_minutes": number,"attendance": number,"author_id": string,"id"?: string,"interaction_type_id": string,"notes"?: string | null,"resident_involvement"?: Database["public"]['Enums']["resident_involvement"],"session_id": string,"site_id"?: string | null,"submitted_at"?: string,"updated_at"?: string
                  }
                  Update: {
                    "actual_minutes"?: number,"attendance"?: number,"author_id"?: string,"id"?: string,"interaction_type_id"?: string,"notes"?: string | null,"resident_involvement"?: Database["public"]['Enums']["resident_involvement"],"session_id"?: string,"site_id"?: string | null,"submitted_at"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "session_report_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "person"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "session_report_interaction_type_id_fkey"
      columns: ["interaction_type_id"]
isOneToOne: false
      referencedRelation: "interaction_type"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "session_report_session_id_fkey"
      columns: ["session_id"]
isOneToOne: true
      referencedRelation: "session"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "session_report_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "site"
      referencedColumns: ["id"]
    }
                  ]
                },"setting": {
                  Row: {
                    "key": string,"updated_at": string,"value": string
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"updated_at"?: string,"value": string
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string,"value"?: string
                  }
                  Relationships: [
                    
                  ]
                },"site": {
                  Row: {
                    "active": boolean,"address": string | null,"care_levels": (Database["public"]['Enums']["care_level"])[],"city": string | null,"created_at": string,"detailed_relationship_notes": boolean,"display_name": string,"id": string,"name": string,"partner_id": string,"state": string | null,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"address"?: string | null,"care_levels"?: (Database["public"]['Enums']["care_level"])[],"city"?: string | null,"created_at"?: string,"detailed_relationship_notes"?: boolean,"display_name": string,"id"?: string,"name": string,"partner_id": string,"state"?: string | null,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"address"?: string | null,"care_levels"?: (Database["public"]['Enums']["care_level"])[],"city"?: string | null,"created_at"?: string,"detailed_relationship_notes"?: boolean,"display_name"?: string,"id"?: string,"name"?: string,"partner_id"?: string,"state"?: string | null,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "site_partner_id_fkey"
      columns: ["partner_id"]
isOneToOne: false
      referencedRelation: "partner"
      referencedColumns: ["id"]
    }
                  ]
                },"staff_assignment": {
                  Row: {
                    "created_at": string,"ends_on": string | null,"id": string,"person_id": string,"residency_id": string,"role": Database["public"]['Enums']["staff_role"],"starts_on": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"ends_on"?: string | null,"id"?: string,"person_id": string,"residency_id": string,"role": Database["public"]['Enums']["staff_role"],"starts_on"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"ends_on"?: string | null,"id"?: string,"person_id"?: string,"residency_id"?: string,"role"?: Database["public"]['Enums']["staff_role"],"starts_on"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_assignment_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "person"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_assignment_residency_id_fkey"
      columns: ["residency_id"]
isOneToOne: false
      referencedRelation: "residency"
      referencedColumns: ["id"]
    }
                  ]
                },"stipend_installment": {
                  Row: {
                    "amount": number,"contract_id": string,"due_on": string,"id": string,"kind": Database["public"]['Enums']["stipend_kind"]
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"contract_id": string,"due_on": string,"id"?: string,"kind": Database["public"]['Enums']["stipend_kind"]
                  }
                  Update: {
                    "amount"?: number,"contract_id"?: string,"due_on"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["stipend_kind"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "stipend_installment_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "contract"
      referencedColumns: ["id"]
    }
                  ]
                },"target": {
                  Row: {
                    "id": string,"metric": string,"season_id": string,"updated_at": string,"value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"metric": string,"season_id": string,"updated_at"?: string,"value": number
                  }
                  Update: {
                    "id"?: string,"metric"?: string,"season_id"?: string,"updated_at"?: string,"value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "target_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "season"
      referencedColumns: ["id"]
    }
                  ]
                },"time_category": {
                  Row: {
                    "active": boolean,"description": string | null,"id": string,"name": string,"paid_hourly": boolean,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"description"?: string | null,"id"?: string,"name": string,"paid_hourly"?: boolean,"sort_order"?: number
                  }
                  Update: {
                    "active"?: boolean,"description"?: string | null,"id"?: string,"name"?: string,"paid_hourly"?: boolean,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"time_entry": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"hours": number,"id": string,"person_id": string,"residency_id": string,"returned_note": string | null,"source": string,"state": Database["public"]['Enums']["time_state"],"submitted_at": string | null,"time_category_id": string,"updated_at": string,"week_starting": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"hours": number,"id"?: string,"person_id": string,"residency_id": string,"returned_note"?: string | null,"source"?: string,"state"?: Database["public"]['Enums']["time_state"],"submitted_at"?: string | null,"time_category_id": string,"updated_at"?: string,"week_starting": string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"hours"?: number,"id"?: string,"person_id"?: string,"residency_id"?: string,"returned_note"?: string | null,"source"?: string,"state"?: Database["public"]['Enums']["time_state"],"submitted_at"?: string | null,"time_category_id"?: string,"updated_at"?: string,"week_starting"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "time_entry_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "person"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "time_entry_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "person"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "time_entry_residency_id_fkey"
      columns: ["residency_id"]
isOneToOne: false
      referencedRelation: "residency"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "time_entry_time_category_id_fkey"
      columns: ["time_category_id"]
isOneToOne: false
      referencedRelation: "time_category"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "approve_week":
{ Args: { "p_person": string,"p_residency": string,"p_week": string }; Returns: number
                           },
"calendar_feed_events":
{ Args: { "p_token": string }; Returns: {
              "canceled": boolean,"has_set_time": boolean,"is_special_event": boolean,"minutes": number,"musicians": string,"residency_name": string,"room": string,"session_id": string,"site_name": string,"starts_at": string,"timezone": string,"title": string,"updated_at": string
            }[]
                           },
"calendar_recipients":
{ Args: { "p_residency": string,"p_site": string }; Returns: Json
                           },
"can_add_site_residents":
{ Args: { "p_site": string }; Returns: boolean
                           },
"can_plan_site":
{ Args: { "p_site": string }; Returns: boolean
                           },
"can_schedule":
{ Args: { "p_residency": string }; Returns: boolean
                           },
"can_see_site_residents":
{ Args: { "p_site": string }; Returns: boolean
                           },
"can_view_residency":
{ Args: { "p_residency": string }; Returns: boolean
                           },
"can_view_site":
{ Args: { "p_site": string }; Returns: boolean
                           },
"cancel_day_of":
{ Args: { "p_reason": Database["public"]['Enums']["cancellation_reason"],"p_session": string }; Returns: undefined
                           },
"confirm_schedule_month":
{ Args: { "p_month": string,"p_residency": string,"p_site": string }; Returns: undefined
                           },
"decide_change_request":
{ Args: { "p_approve": boolean,"p_note"?: string,"p_request": string }; Returns: undefined
                           },
"delete_one_time_session":
{ Args: { "p_session": string }; Returns: undefined
                           },
"delete_series":
{ Args: { "p_series": string }; Returns: number
                           },
"documented_minutes":
{ Args: { "p_person": string,"p_residency": string,"p_week": string }; Returns: {
              "category": string,"minutes": number
            }[]
                           },
"end_series":
{ Args: { "p_last": string,"p_series": string }; Returns: Json
                           },
"finalize_schedule_month":
{ Args: { "p_month": string,"p_residency": string,"p_site": string }; Returns: Json
                           },
"flag_schedule_check_changed":
{ Args: { "p_session": string }; Returns: undefined
                           },
"generate_residency_month":
{ Args: { "p_month": string,"p_residency": string }; Returns: number
                           },
"generate_season":
{ Args: { "p_season": string }; Returns: number
                           },
"generate_series_month":
{ Args: { "p_month": string,"p_series": string }; Returns: number
                           },
"invoice_lines_total":
{ Args: { "p_lines": Json }; Returns: number
                           },
"is_active_person":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_activity_in_approved_week":
{ Args: { "p_activity": string }; Returns: boolean
                           },
"is_activity_logger":
{ Args: { "p_activity": string }; Returns: boolean
                           },
"is_activity_musician":
{ Args: { "p_activity": string }; Returns: boolean
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_current_admin_lead":
{ Args: { "p_residency": string }; Returns: boolean
                           },
"is_current_staff":
{ Args: { "p_residency": string,"p_role"?: Database["public"]['Enums']["staff_role"] }; Returns: boolean
                           },
"is_on_current_roster":
{ Args: { "p_person"?: string,"p_residency": string }; Returns: boolean
                           },
"is_playing":
{ Args: { "p_session": string }; Returns: boolean
                           },
"is_session_in_approved_week":
{ Args: { "p_session": string }; Returns: boolean
                           },
"is_session_leader":
{ Args: { "p_session": string }; Returns: boolean
                           },
"is_session_month_reviewed":
{ Args: { "p_session": string }; Returns: boolean
                           },
"is_week_approved":
{ Args: { "p_day": string,"p_person": string,"p_residency": string }; Returns: boolean
                           },
"location_in_residency":
{ Args: { "p_location": string,"p_residency": string }; Returns: boolean
                           },
"log_relationship_activity":
{ Args: { "p_collaborative": boolean,"p_end_time": string,"p_id": string,"p_kind": Database["public"]['Enums']["activity_kind"],"p_minutes": number,"p_new_residents": Json,"p_note": string,"p_occurred_on": string,"p_residency": string,"p_residents": Json,"p_shared_with": (string)[],"p_site": string,"p_start_time": string }; Returns: string
                           },
"mark_absent_with_substitute":
{ Args: { "p_session": string,"p_substitute": string }; Returns: string
                           },
"mark_month_reviewed":
{ Args: { "p_month": string,"p_residency": string,"p_site": string }; Returns: string
                           },
"mark_not_there":
{ Args: { "p_not_there": boolean,"p_session": string }; Returns: undefined
                           },
"mark_schedule_checked":
{ Args: { "p_month": string,"p_residency": string,"p_site": string }; Returns: boolean
                           },
"may_change_approved":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"merge_person":
{ Args: { "p_end_sessions"?: boolean,"p_from": string,"p_into": string }; Returns: undefined
                           },
"missing_work":
{ Args: { "p_residency": string,"p_week": string }; Returns: {
              "documented_minutes": number,"hours_state": string,"person_id": string,"undocumented": number
            }[]
                           },
"missing_work_internal":
{ Args: { "p_residency": string,"p_week": string }; Returns: {
              "documented_minutes": number,"hours_state": string,"person_id": string,"undocumented": number
            }[]
                           },
"month_players":
{ Args: { "p_month": string,"p_residency": string,"p_site": string }; Returns: string[]
                           },
"month_sessions":
{ Args: { "p_month": string,"p_residency": string,"p_site": string }; Returns: string[]
                           },
"musician_invoice_lines":
{ Args: { "p_person": string,"p_start": string }; Returns: {
              "amount": number,"description": string,"quantity": number,"residency_name": string,"sort": number,"unit": string,"unit_amount": number
            }[]
                           },
"my_assignment":
{ Args: { "p_session": string }; Returns: {
              "created_at": string,
"id": string,
"person_id": string,
"role": Database["public"]['Enums']["assignment_role"],
"session_id": string,
"status": Database["public"]['Enums']["assignment_status"],
"substitute_for_id": string | null,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "session_assignment"
        isOneToOne: true
        isSetofReturn: false
      } },
"my_tasks":
{ Args: Record<PropertyKey, never>; Returns: {
              "detail": string,"due_on": string,"kind": string,"month": string,"request_id": string,"residency_id": string,"session_id": string,"site_id": string,"title": string
            }[]
                           },
"new_calendar_version":
{ Args: { "p_month": string,"p_partner_feedback"?: string,"p_residency": string,"p_site": string }; Returns: string
                           },
"notify_point_people":
{ Args: { "p_body": string,"p_dedupe": string,"p_kind": string,"p_residency": string,"p_subject": string }; Returns: undefined
                           },
"open_schedule_month":
{ Args: { "p_month": string,"p_residency": string,"p_site": string }; Returns: number
                           },
"partner_billable_minutes":
{ Args: { "p_agreement": string,"p_from": string,"p_to": string }; Returns: {
              "approved_minutes": number,"category": string,"site_id": string,"undocumented": number,"waiting_minutes": number
            }[]
                           },
"partner_billable_stipends":
{ Args: { "p_agreement": string,"p_from": string,"p_to": string }; Returns: {
              "amount": number,"due_on": string,"id": string,"kind": string
            }[]
                           },
"publish_month":
{ Args: { "p_month": string,"p_residency": string,"p_site": string }; Returns: string
                           },
"queue_deadline_reminders":
{ Args: { "p_now"?: string }; Returns: number
                           },
"queue_month_reminders":
{ Args: { "p_now"?: string }; Returns: number
                           },
"refresh_week_hours":
{ Args: { "p_person": string,"p_residency": string,"p_state": Database["public"]['Enums']["time_state"],"p_week": string }; Returns: undefined
                           },
"remove_session":
{ Args: { "p_session": string }; Returns: undefined
                           },
"request_change":
{ Args: { "p_kind": string,"p_note"?: string,"p_person"?: string,"p_session": string }; Returns: string
                           },
"request_leader_swap":
{ Args: { "p_note"?: string,"p_person": string,"p_session": string }; Returns: string
                           },
"require_schedule_month":
{ Args: { "p_month": string,"p_residency": string,"p_site": string }; Returns: {
              "confirmed_at": string | null,
"confirmed_by": string | null,
"final_due_on": string,
"finalized_at": string | null,
"finalized_by": string | null,
"id": string,
"month": string,
"opened_at": string,
"opened_by": string | null,
"residency_id": string,
"sent_at": string | null,
"sent_by": string | null,
"site_id": string,
"stage": Database["public"]['Enums']["schedule_month_stage"],
"team_due_on": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "schedule_month"
        isOneToOne: true
        isSetofReturn: false
      } },
"residency_people":
{ Args: { "p_residency": string }; Returns: {
              "id": string,"name": string
            }[]
                           },
"residency_roster_contacts":
{ Args: { "p_residency": string }; Returns: {
              "instruments": (string)[],"person_id": string,"phone": string
            }[]
                           },
"retire_site_contact":
{ Args: { "p_contact": string,"p_site": string }; Returns: undefined
                           },
"return_week":
{ Args: { "p_note": string,"p_person": string,"p_residency": string,"p_week": string }; Returns: number
                           },
"save_site_contact":
{ Args: { "p_contact": string,"p_email": string,"p_name": string,"p_phone": string,"p_site": string,"p_title": string }; Returns: string
                           },
"schedule_due_on":
{ Args: { "p_default": number,"p_key": string,"p_month": string }; Returns: string
                           },
"schedule_month_send_info":
{ Args: { "p_month": string,"p_residency": string,"p_site": string }; Returns: Json
                           },
"send_schedule_month":
{ Args: { "p_month": string,"p_residency": string,"p_site": string }; Returns: Json
                           },
"session_has_musicians":
{ Args: { "p_session": string }; Returns: boolean
                           },
"session_is_kept":
{ Args: { "p_session": string }; Returns: boolean
                           },
"session_label":
{ Args: { "p_session": string }; Returns: string
                           },
"session_local_date":
{ Args: { "p_session": string }; Returns: string
                           },
"session_schedule_month":
{ Args: { "p_session": string }; Returns: {
              "confirmed_at": string | null,
"confirmed_by": string | null,
"final_due_on": string,
"finalized_at": string | null,
"finalized_by": string | null,
"id": string,
"month": string,
"opened_at": string,
"opened_by": string | null,
"residency_id": string,
"sent_at": string | null,
"sent_by": string | null,
"site_id": string,
"stage": Database["public"]['Enums']["schedule_month_stage"],
"team_due_on": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "schedule_month"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_resident_room":
{ Args: { "p_resident": string,"p_room": string }; Returns: undefined
                           },
"set_series_leader":
{ Args: { "p_person": string,"p_series": string }; Returns: number
                           },
"set_unavailable":
{ Args: { "p_session": string,"p_unavailable": boolean }; Returns: number
                           },
"site_has_detailed_notes":
{ Args: { "p_site": string }; Returns: boolean
                           },
"staff_directory":
{ Args: Record<PropertyKey, never>; Returns: {
              "email": string,"job_title": string,"name": string,"person_id": string,"phone": string
            }[]
                           },
"submit_week":
{ Args: { "p_residency": string,"p_week": string }; Returns: undefined
                           },
"take_lead_to_document":
{ Args: { "p_session": string }; Returns: undefined
                           },
"tidy_series_dates":
{ Args: { "p_series": string }; Returns: Json
                           },
"undo_confirm_schedule_month":
{ Args: { "p_month": string,"p_residency": string,"p_site": string }; Returns: undefined
                           },
"undo_schedule_checked":
{ Args: { "p_month": string,"p_residency": string,"p_site": string }; Returns: undefined
                           },
"undocumented_led_sessions":
{ Args: { "p_person": string,"p_residency": string,"p_week": string }; Returns: {
              "session_id": string,"starts_at": string,"title": string
            }[]
                           },
"undocumented_played_sessions":
{ Args: { "p_person": string,"p_residency": string,"p_week": string }; Returns: {
              "leader_name": string,"session_id": string
            }[]
                           },
"week_monday":
{ Args: { "p_day": string }; Returns: string
                           },
"week_of_month":
{ Args: { "p_day": string }; Returns: number
                           },
"withdraw_change_request":
{ Args: { "p_request": string }; Returns: undefined
                           }
          }
          Enums: {
            "activity_kind": "one_to_one"|"mini_group"|"hallway_concert","assignment_role": "leader"|"participant","assignment_status": "assigned"|"absent"|"substitute","billing_basis": "per_hour"|"installments","calendar_state": "reviewed"|"sent","cancellation_reason": "partner"|"weather"|"musician"|"other","care_level": "independent"|"assisted"|"memory_care"|"skilled_nursing"|"adult_day"|"affordable_housing"|"other","employment_type": "contractor_1099"|"employee_w2"|"volunteer","model_type": "performance"|"small_group"|"one_to_one","overhead_billing": "same_invoice"|"separate_invoice","partner_invoice_kind": "site"|"overhead"|"contract","partner_invoice_state": "sent"|"paid","residency_status": "planned"|"active"|"paused"|"ended","resident_involvement": "none"|"co_facilitated"|"co_led","schedule_month_stage": "team_editing"|"team_confirmed"|"sent_to_partner"|"partner_changes"|"final","schedule_state": "draft"|"published"|"canceled","season_kind": "semester"|"season"|"summer_session"|"other","session_kind": "group_session"|"relationship_building","staff_role": "point_person"|"support","stipend_kind": "project_support"|"admin_lead"|"training"|"other","system_role": "admin","time_state": "draft"|"submitted"|"approved"
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
  "public": {
          Enums: {
            "activity_kind": ["one_to_one", "mini_group", "hallway_concert"],"assignment_role": ["leader", "participant"],"assignment_status": ["assigned", "absent", "substitute"],"billing_basis": ["per_hour", "installments"],"calendar_state": ["reviewed", "sent"],"cancellation_reason": ["partner", "weather", "musician", "other"],"care_level": ["independent", "assisted", "memory_care", "skilled_nursing", "adult_day", "affordable_housing", "other"],"employment_type": ["contractor_1099", "employee_w2", "volunteer"],"model_type": ["performance", "small_group", "one_to_one"],"overhead_billing": ["same_invoice", "separate_invoice"],"partner_invoice_kind": ["site", "overhead", "contract"],"partner_invoice_state": ["sent", "paid"],"residency_status": ["planned", "active", "paused", "ended"],"resident_involvement": ["none", "co_facilitated", "co_led"],"schedule_month_stage": ["team_editing", "team_confirmed", "sent_to_partner", "partner_changes", "final"],"schedule_state": ["draft", "published", "canceled"],"season_kind": ["semester", "season", "summer_session", "other"],"session_kind": ["group_session", "relationship_building"],"staff_role": ["point_person", "support"],"stipend_kind": ["project_support", "admin_lead", "training", "other"],"system_role": ["admin"],"time_state": ["draft", "submitted", "approved"]
          }
        }
} as const
