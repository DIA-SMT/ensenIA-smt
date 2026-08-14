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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          class_id: string | null
          content_md: string
          course_id: string
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          points: number | null
          questions: Json
          school_id: string
          source_tool: Database["public"]["Enums"]["ia_tool_type"] | null
          status: Database["public"]["Enums"]["activity_status"]
          subject_id: string
          teacher_id: string
          title: string
          unit_id: string | null
          updated_at: string | null
        }
        Insert: {
          class_id?: string | null
          content_md?: string
          course_id: string
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          points?: number | null
          questions?: Json
          school_id: string
          source_tool?: Database["public"]["Enums"]["ia_tool_type"] | null
          status?: Database["public"]["Enums"]["activity_status"]
          subject_id: string
          teacher_id: string
          title: string
          unit_id?: string | null
          updated_at?: string | null
        }
        Update: {
          class_id?: string | null
          content_md?: string
          course_id?: string
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          points?: number | null
          questions?: Json
          school_id?: string
          source_tool?: Database["public"]["Enums"]["ia_tool_type"] | null
          status?: Database["public"]["Enums"]["activity_status"]
          subject_id?: string
          teacher_id?: string
          title?: string
          unit_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "planning_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "planning_units"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_events: {
        Row: {
          activity_id: string
          created_at: string | null
          event_type: string
          id: string
          metadata: Json
          student_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string | null
          event_type: string
          id?: string
          metadata?: Json
          student_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_submissions: {
        Row: {
          activity_id: string
          answers: Json
          auto_score: number | null
          created_at: string | null
          feedback: string | null
          feedback_reaction: string | null
          graded_at: string | null
          id: string
          response_text: string | null
          score: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["submission_status"]
          student_id: string
          submitted_at: string | null
          time_spent_seconds: number
          updated_at: string | null
        }
        Insert: {
          activity_id: string
          answers?: Json
          auto_score?: number | null
          created_at?: string | null
          feedback?: string | null
          feedback_reaction?: string | null
          graded_at?: string | null
          id?: string
          response_text?: string | null
          score?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          student_id: string
          submitted_at?: string | null
          time_spent_seconds?: number
          updated_at?: string | null
        }
        Update: {
          activity_id?: string
          answers?: Json
          auto_score?: number | null
          created_at?: string | null
          feedback?: string | null
          feedback_reaction?: string | null
          graded_at?: string | null
          id?: string
          response_text?: string | null
          score?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          student_id?: string
          submitted_at?: string | null
          time_spent_seconds?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_submissions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_students: {
        Row: {
          alert_id: string
          student_id: string
        }
        Insert: {
          alert_id: string
          student_id: string
        }
        Update: {
          alert_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_students_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          category: Database["public"]["Enums"]["alert_category"]
          created_at: string | null
          date_label: string | null
          id: string
          is_read: boolean
          message: string
          school_id: string
          teacher_id: string | null
          title: string
          type: Database["public"]["Enums"]["alert_level"]
        }
        Insert: {
          category: Database["public"]["Enums"]["alert_category"]
          created_at?: string | null
          date_label?: string | null
          id?: string
          is_read?: boolean
          message: string
          school_id: string
          teacher_id?: string | null
          title: string
          type: Database["public"]["Enums"]["alert_level"]
        }
        Update: {
          category?: Database["public"]["Enums"]["alert_category"]
          created_at?: string | null
          date_label?: string | null
          id?: string
          is_read?: boolean
          message?: string
          school_id?: string
          teacher_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["alert_level"]
        }
        Relationships: [
          {
            foreignKeyName: "alerts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          model_used: Database["public"]["Enums"]["ia_model"] | null
          role: Database["public"]["Enums"]["chat_role"]
          session_id: string
          token_count: number | null
          tool_used: Database["public"]["Enums"]["ia_tool_type"] | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          model_used?: Database["public"]["Enums"]["ia_model"] | null
          role: Database["public"]["Enums"]["chat_role"]
          session_id: string
          token_count?: number | null
          tool_used?: Database["public"]["Enums"]["ia_tool_type"] | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          model_used?: Database["public"]["Enums"]["ia_model"] | null
          role?: Database["public"]["Enums"]["chat_role"]
          session_id?: string
          token_count?: number | null
          tool_used?: Database["public"]["Enums"]["ia_tool_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          class_id: string | null
          course_id: string | null
          created_at: string | null
          id: string
          subject_id: string | null
          teacher_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          class_id?: string | null
          course_id?: string | null
          created_at?: string | null
          id?: string
          subject_id?: string | null
          teacher_id: string
          title?: string
          updated_at?: string | null
        }
        Update: {
          class_id?: string | null
          course_id?: string | null
          created_at?: string | null
          id?: string
          subject_id?: string | null
          teacher_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "planning_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_sessions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_sessions_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_reads: {
        Row: {
          communication_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          communication_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          communication_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_reads_communication_id_fkey"
            columns: ["communication_id"]
            isOneToOne: false
            referencedRelation: "communications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_recipients: {
        Row: {
          communication_id: string
          user_id: string
        }
        Insert: {
          communication_id: string
          user_id: string
        }
        Update: {
          communication_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_recipients_communication_id_fkey"
            columns: ["communication_id"]
            isOneToOne: false
            referencedRelation: "communications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      communications: {
        Row: {
          body: string
          from_user_id: string
          id: string
          is_broadcast: boolean
          priority: Database["public"]["Enums"]["notification_priority"]
          school_id: string
          sent_at: string | null
          subject: string
        }
        Insert: {
          body: string
          from_user_id: string
          id?: string
          is_broadcast?: boolean
          priority?: Database["public"]["Enums"]["notification_priority"]
          school_id: string
          sent_at?: string | null
          subject: string
        }
        Update: {
          body?: string
          from_user_id?: string
          id?: string
          is_broadcast?: boolean
          priority?: Database["public"]["Enums"]["notification_priority"]
          school_id?: string
          sent_at?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "communications_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          created_at: string | null
          division: string
          id: string
          name: string
          school_id: string
          student_count: number
          year: number
        }
        Insert: {
          created_at?: string | null
          division: string
          id?: string
          name: string
          school_id: string
          student_count?: number
          year: number
        }
        Update: {
          created_at?: string | null
          division?: string
          id?: string
          name?: string
          school_id?: string
          student_count?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "courses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          course_id: string
          created_at: string | null
          enrollment_code: string
          id: string
          school_id: string
          student_id: string
          subject_id: string
        }
        Insert: {
          course_id: string
          created_at?: string | null
          enrollment_code: string
          id?: string
          school_id: string
          student_id: string
          subject_id: string
        }
        Update: {
          course_id?: string
          created_at?: string | null
          enrollment_code?: string
          id?: string
          school_id?: string
          student_id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      guardian_notice_receipts: {
        Row: {
          guardian_user_id: string
          notice_id: string
          read_at: string | null
          responded_at: string | null
          response: string | null
        }
        Insert: {
          guardian_user_id: string
          notice_id: string
          read_at?: string | null
          responded_at?: string | null
          response?: string | null
        }
        Update: {
          guardian_user_id?: string
          notice_id?: string
          read_at?: string | null
          responded_at?: string | null
          response?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guardian_notice_receipts_guardian_user_id_fkey"
            columns: ["guardian_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_notice_receipts_notice_id_fkey"
            columns: ["notice_id"]
            isOneToOne: false
            referencedRelation: "guardian_notices"
            referencedColumns: ["id"]
          },
        ]
      }
      guardian_notices: {
        Row: {
          body: string
          created_at: string | null
          from_user_id: string
          id: string
          meeting_at: string | null
          meeting_place: string | null
          school_id: string
          student_id: string | null
          title: string
          type: string
        }
        Insert: {
          body: string
          created_at?: string | null
          from_user_id: string
          id?: string
          meeting_at?: string | null
          meeting_place?: string | null
          school_id: string
          student_id?: string | null
          title: string
          type: string
        }
        Update: {
          body?: string
          created_at?: string | null
          from_user_id?: string
          id?: string
          meeting_at?: string | null
          meeting_place?: string | null
          school_id?: string
          student_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardian_notices_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_notices_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_notices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_usage: {
        Row: {
          id: string
          message_count: number
          teacher_id: string
          token_count_in: number
          token_count_out: number
          usage_date: string
        }
        Insert: {
          id?: string
          message_count?: number
          teacher_id: string
          token_count_in?: number
          token_count_out?: number
          usage_date?: string
        }
        Update: {
          id?: string
          message_count?: number
          teacher_id?: string
          token_count_in?: number
          token_count_out?: number
          usage_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "ia_usage_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      library_materials: {
        Row: {
          ai_summary: string | null
          description: string | null
          extracted_text: string | null
          file_name: string | null
          file_size: string | null
          file_size_bytes: number | null
          file_type: Database["public"]["Enums"]["file_type"]
          id: string
          is_shared_with_students: boolean
          practice_quiz: Json | null
          school_id: string
          storage_path: string | null
          study_cards: Json | null
          study_guide: string | null
          subject_id: string
          subject_name: string
          tags: string[] | null
          teacher_id: string
          title: string
          unit_name: string | null
          uploaded_at: string | null
        }
        Insert: {
          ai_summary?: string | null
          description?: string | null
          extracted_text?: string | null
          file_name?: string | null
          file_size?: string | null
          file_size_bytes?: number | null
          file_type?: Database["public"]["Enums"]["file_type"]
          id?: string
          is_shared_with_students?: boolean
          practice_quiz?: Json | null
          school_id: string
          storage_path?: string | null
          study_cards?: Json | null
          study_guide?: string | null
          subject_id: string
          subject_name: string
          tags?: string[] | null
          teacher_id: string
          title: string
          unit_name?: string | null
          uploaded_at?: string | null
        }
        Update: {
          ai_summary?: string | null
          description?: string | null
          extracted_text?: string | null
          file_name?: string | null
          file_size?: string | null
          file_size_bytes?: number | null
          file_type?: Database["public"]["Enums"]["file_type"]
          id?: string
          is_shared_with_students?: boolean
          practice_quiz?: Json | null
          school_id?: string
          storage_path?: string | null
          study_cards?: Json | null
          study_guide?: string | null
          subject_id?: string
          subject_name?: string
          tags?: string[] | null
          teacher_id?: string
          title?: string
          unit_name?: string | null
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "library_materials_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_materials_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_materials_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          notification_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          notification_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          notification_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          from_user_id: string
          id: string
          message: string
          priority: Database["public"]["Enums"]["notification_priority"]
          school_id: string
          title: string
          to_user_id: string | null
        }
        Insert: {
          created_at?: string | null
          from_user_id: string
          id?: string
          message: string
          priority?: Database["public"]["Enums"]["notification_priority"]
          school_id: string
          title: string
          to_user_id?: string | null
        }
        Update: {
          created_at?: string | null
          from_user_id?: string
          id?: string
          message?: string
          priority?: Database["public"]["Enums"]["notification_priority"]
          school_id?: string
          title?: string
          to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_classes: {
        Row: {
          content: string | null
          created_at: string | null
          id: string
          is_complete: boolean
          objectives: string[] | null
          sort_order: number
          title: string
          unit_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          id?: string
          is_complete?: boolean
          objectives?: string[] | null
          sort_order?: number
          title: string
          unit_id: string
        }
        Update: {
          content?: string | null
          created_at?: string | null
          id?: string
          is_complete?: boolean
          objectives?: string[] | null
          sort_order?: number
          title?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_classes_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "planning_units"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_units: {
        Row: {
          course_id: string
          created_at: string | null
          id: string
          sort_order: number
          subject_id: string
          teacher_id: string
          title: string
        }
        Insert: {
          course_id: string
          created_at?: string | null
          id?: string
          sort_order?: number
          subject_id: string
          teacher_id: string
          title: string
        }
        Update: {
          course_id?: string
          created_at?: string | null
          id?: string
          sort_order?: number
          subject_id?: string
          teacher_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_units_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_units_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_units_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_attempts: {
        Row: {
          created_at: string | null
          id: string
          material_id: string | null
          score: number
          student_id: string
          total: number
          xp_earned: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          material_id?: string | null
          score: number
          student_id: string
          total: number
          xp_earned?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          material_id?: string | null
          score?: number
          student_id?: string
          total?: number
          xp_earned?: number
        }
        Relationships: [
          {
            foreignKeyName: "practice_attempts_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "library_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_initials: string
          created_at: string | null
          email: string
          first_name: string
          id: string
          last_name: string
          role: Database["public"]["Enums"]["user_role"]
          school_id: string
        }
        Insert: {
          avatar_initials?: string
          created_at?: string | null
          email: string
          first_name: string
          id: string
          last_name: string
          role?: Database["public"]["Enums"]["user_role"]
          school_id: string
        }
        Update: {
          avatar_initials?: string
          created_at?: string | null
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          role?: Database["public"]["Enums"]["user_role"]
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_notes: {
        Row: {
          created_at: string | null
          id: string
          is_pinned: boolean
          teacher_id: string
          text: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_pinned?: boolean
          teacher_id: string
          text: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_pinned?: boolean
          teacher_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_notes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_blocks: {
        Row: {
          color_class: string
          course_id: string
          course_name: string
          created_at: string | null
          day_index: number
          day_of_week: Database["public"]["Enums"]["day_of_week"]
          duration: number
          id: string
          room: string | null
          school_id: string
          start_hour: number
          student_count: number
          subject_id: string
          subject_name: string
          teacher_id: string
        }
        Insert: {
          color_class?: string
          course_id: string
          course_name: string
          created_at?: string | null
          day_index: number
          day_of_week: Database["public"]["Enums"]["day_of_week"]
          duration?: number
          id?: string
          room?: string | null
          school_id: string
          start_hour: number
          student_count?: number
          subject_id: string
          subject_name: string
          teacher_id: string
        }
        Update: {
          color_class?: string
          course_id?: string
          course_name?: string
          created_at?: string | null
          day_index?: number
          day_of_week?: Database["public"]["Enums"]["day_of_week"]
          duration?: number
          id?: string
          room?: string | null
          school_id?: string
          start_hour?: number
          student_count?: number
          subject_id?: string
          subject_name?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_blocks_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_blocks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_blocks_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_blocks_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          address: string | null
          created_at: string | null
          district: string | null
          id: string
          name: string
          short_name: string
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          district?: string | null
          id?: string
          name: string
          short_name: string
        }
        Update: {
          address?: string | null
          created_at?: string | null
          district?: string | null
          id?: string
          name?: string
          short_name?: string
        }
        Relationships: []
      }
      student_badges: {
        Row: {
          badge_code: string
          earned_at: string | null
          student_id: string
        }
        Insert: {
          badge_code: string
          earned_at?: string | null
          student_id: string
        }
        Update: {
          badge_code?: string
          earned_at?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_badges_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_checkins: {
        Row: {
          activity_id: string | null
          comment: string | null
          created_at: string | null
          feeling: string
          id: string
          moment: string
          student_id: string
        }
        Insert: {
          activity_id?: string | null
          comment?: string | null
          created_at?: string | null
          feeling: string
          id?: string
          moment: string
          student_id: string
        }
        Update: {
          activity_id?: string | null
          comment?: string | null
          created_at?: string | null
          feeling?: string
          id?: string
          moment?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_checkins_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_checkins_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_guardians: {
        Row: {
          created_at: string | null
          guardian_user_id: string
          id: string
          relationship: string
          student_id: string
        }
        Insert: {
          created_at?: string | null
          guardian_user_id: string
          id?: string
          relationship?: string
          student_id: string
        }
        Update: {
          created_at?: string | null
          guardian_user_id?: string
          id?: string
          relationship?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_guardians_guardian_user_id_fkey"
            columns: ["guardian_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_guardians_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_notes: {
        Row: {
          created_at: string | null
          id: string
          is_done: boolean
          is_pinned: boolean
          student_id: string
          text: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_done?: boolean
          is_pinned?: boolean
          student_id: string
          text: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_done?: boolean
          is_pinned?: boolean
          student_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_notes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_observations: {
        Row: {
          category: string
          created_at: string | null
          id: string
          note: string
          student_id: string
          subject_id: string | null
          teacher_id: string
        }
        Insert: {
          category: string
          created_at?: string | null
          id?: string
          note: string
          student_id: string
          subject_id?: string | null
          teacher_id: string
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          note?: string
          student_id?: string
          subject_id?: string | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_observations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_observations_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_observations_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_progress: {
        Row: {
          best_streak: number
          last_practice_date: string | null
          perfect_count: number
          streak_days: number
          student_id: string
          total_attempts: number
          updated_at: string | null
          xp: number
        }
        Insert: {
          best_streak?: number
          last_practice_date?: string | null
          perfect_count?: number
          streak_days?: number
          student_id: string
          total_attempts?: number
          updated_at?: string | null
          xp?: number
        }
        Update: {
          best_streak?: number
          last_practice_date?: string | null
          perfect_count?: number
          streak_days?: number
          student_id?: string
          total_attempts?: number
          updated_at?: string | null
          xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "student_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          alerts_count: number
          attendance: number
          avatar_initials: string
          average: number
          course_id: string
          created_at: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          progress: number
          school_id: string
          status: Database["public"]["Enums"]["student_status"]
          user_id: string | null
        }
        Insert: {
          alerts_count?: number
          attendance?: number
          avatar_initials?: string
          average?: number
          course_id: string
          created_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          progress?: number
          school_id: string
          status?: Database["public"]["Enums"]["student_status"]
          user_id?: string | null
        }
        Update: {
          alerts_count?: number
          attendance?: number
          avatar_initials?: string
          average?: number
          course_id?: string
          created_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          progress?: number
          school_id?: string
          status?: Database["public"]["Enums"]["student_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          color: string
          created_at: string | null
          id: string
          name: string
          school_id: string
        }
        Insert: {
          color?: string
          created_at?: string | null
          id?: string
          name: string
          school_id: string
        }
        Update: {
          color?: string
          created_at?: string | null
          id?: string
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_assignments: {
        Row: {
          course_id: string
          created_at: string | null
          id: string
          subject_id: string
          teacher_id: string
        }
        Insert: {
          course_id: string
          created_at?: string | null
          id?: string
          subject_id: string
          teacher_id: string
        }
        Update: {
          course_id?: string
          created_at?: string | null
          id?: string
          subject_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_assignments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_guardian_student_ids: { Args: never; Returns: string[] }
      auth_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      auth_school_id: { Args: never; Returns: string }
      auth_student_id: { Args: never; Returns: string }
    }
    Enums: {
      activity_status: "draft" | "published" | "closed"
      alert_category: "academic" | "attendance" | "conduct" | "system"
      alert_level: "danger" | "warning" | "info" | "success"
      chat_role: "user" | "assistant" | "system"
      day_of_week: "lunes" | "martes" | "miercoles" | "jueves" | "viernes"
      file_type: "pdf" | "doc" | "image" | "link"
      ia_model: "haiku" | "sonnet"
      ia_tool_type: "act" | "eval" | "sum" | "pres" | "oral" | "free"
      notification_priority: "high" | "medium" | "low"
      student_status: "excellent" | "good" | "warning" | "critical"
      submission_status: "pending" | "in_progress" | "submitted" | "graded"
      user_role: "director" | "docente" | "estudiante" | "padre"
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
      activity_status: ["draft", "published", "closed"],
      alert_category: ["academic", "attendance", "conduct", "system"],
      alert_level: ["danger", "warning", "info", "success"],
      chat_role: ["user", "assistant", "system"],
      day_of_week: ["lunes", "martes", "miercoles", "jueves", "viernes"],
      file_type: ["pdf", "doc", "image", "link"],
      ia_model: ["haiku", "sonnet"],
      ia_tool_type: ["act", "eval", "sum", "pres", "oral", "free"],
      notification_priority: ["high", "medium", "low"],
      student_status: ["excellent", "good", "warning", "critical"],
      submission_status: ["pending", "in_progress", "submitted", "graded"],
      user_role: ["director", "docente", "estudiante", "padre"],
    },
  },
} as const
