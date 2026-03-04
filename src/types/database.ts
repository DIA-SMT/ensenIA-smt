/**
 * ENSEÑIA SMT — Supabase Database Types
 *
 * Manually authored to match the schema in supabase/migrations/001_initial_schema.sql
 * Can be regenerated with: npx supabase gen types typescript --project-id <project-id>
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      schools: {
        Row: {
          id: string;
          name: string;
          short_name: string;
          address: string | null;
          district: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          short_name: string;
          address?: string | null;
          district?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          short_name?: string;
          address?: string | null;
          district?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          first_name: string;
          last_name: string;
          role: Database['public']['Enums']['user_role'];
          school_id: string;
          avatar_initials: string;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          first_name: string;
          last_name: string;
          role?: Database['public']['Enums']['user_role'];
          school_id: string;
          avatar_initials?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          first_name?: string;
          last_name?: string;
          role?: Database['public']['Enums']['user_role'];
          school_id?: string;
          avatar_initials?: string;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'profiles_school_id_fkey'; columns: ['school_id']; referencedRelation: 'schools'; referencedColumns: ['id'] },
        ];
      };
      subjects: {
        Row: {
          id: string;
          name: string;
          color: string;
          school_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          color?: string;
          school_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          color?: string;
          school_id?: string;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'subjects_school_id_fkey'; columns: ['school_id']; referencedRelation: 'schools'; referencedColumns: ['id'] },
        ];
      };
      courses: {
        Row: {
          id: string;
          name: string;
          year: number;
          division: string;
          student_count: number;
          school_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          year: number;
          division: string;
          student_count?: number;
          school_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          year?: number;
          division?: string;
          student_count?: number;
          school_id?: string;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'courses_school_id_fkey'; columns: ['school_id']; referencedRelation: 'schools'; referencedColumns: ['id'] },
        ];
      };
      teacher_assignments: {
        Row: {
          id: string;
          teacher_id: string;
          subject_id: string;
          course_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          subject_id: string;
          course_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          subject_id?: string;
          course_id?: string;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'teacher_assignments_teacher_id_fkey'; columns: ['teacher_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'teacher_assignments_subject_id_fkey'; columns: ['subject_id']; referencedRelation: 'subjects'; referencedColumns: ['id'] },
          { foreignKeyName: 'teacher_assignments_course_id_fkey'; columns: ['course_id']; referencedRelation: 'courses'; referencedColumns: ['id'] },
        ];
      };
      students: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          avatar_initials: string;
          course_id: string;
          status: Database['public']['Enums']['student_status'];
          alerts_count: number;
          progress: number;
          attendance: number;
          average: number;
          school_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          first_name: string;
          last_name: string;
          avatar_initials?: string;
          course_id: string;
          status?: Database['public']['Enums']['student_status'];
          alerts_count?: number;
          progress?: number;
          attendance?: number;
          average?: number;
          school_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          first_name?: string;
          last_name?: string;
          avatar_initials?: string;
          course_id?: string;
          status?: Database['public']['Enums']['student_status'];
          alerts_count?: number;
          progress?: number;
          attendance?: number;
          average?: number;
          school_id?: string;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'students_course_id_fkey'; columns: ['course_id']; referencedRelation: 'courses'; referencedColumns: ['id'] },
          { foreignKeyName: 'students_school_id_fkey'; columns: ['school_id']; referencedRelation: 'schools'; referencedColumns: ['id'] },
        ];
      };
      schedule_blocks: {
        Row: {
          id: string;
          teacher_id: string;
          subject_id: string;
          course_id: string;
          subject_name: string;
          course_name: string;
          day_of_week: Database['public']['Enums']['day_of_week'];
          day_index: number;
          start_hour: number;
          duration: number;
          room: string | null;
          color_class: string;
          student_count: number;
          school_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          subject_id: string;
          course_id: string;
          subject_name: string;
          course_name: string;
          day_of_week: Database['public']['Enums']['day_of_week'];
          day_index: number;
          start_hour: number;
          duration?: number;
          room?: string | null;
          color_class?: string;
          student_count?: number;
          school_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          subject_id?: string;
          course_id?: string;
          subject_name?: string;
          course_name?: string;
          day_of_week?: Database['public']['Enums']['day_of_week'];
          day_index?: number;
          start_hour?: number;
          duration?: number;
          room?: string | null;
          color_class?: string;
          student_count?: number;
          school_id?: string;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'schedule_blocks_teacher_id_fkey'; columns: ['teacher_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'schedule_blocks_subject_id_fkey'; columns: ['subject_id']; referencedRelation: 'subjects'; referencedColumns: ['id'] },
          { foreignKeyName: 'schedule_blocks_course_id_fkey'; columns: ['course_id']; referencedRelation: 'courses'; referencedColumns: ['id'] },
          { foreignKeyName: 'schedule_blocks_school_id_fkey'; columns: ['school_id']; referencedRelation: 'schools'; referencedColumns: ['id'] },
        ];
      };
      alerts: {
        Row: {
          id: string;
          type: Database['public']['Enums']['alert_level'];
          category: Database['public']['Enums']['alert_category'];
          title: string;
          message: string;
          date_label: string | null;
          teacher_id: string | null;
          school_id: string;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          type: Database['public']['Enums']['alert_level'];
          category: Database['public']['Enums']['alert_category'];
          title: string;
          message: string;
          date_label?: string | null;
          teacher_id?: string | null;
          school_id: string;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          type?: Database['public']['Enums']['alert_level'];
          category?: Database['public']['Enums']['alert_category'];
          title?: string;
          message?: string;
          date_label?: string | null;
          teacher_id?: string | null;
          school_id?: string;
          is_read?: boolean;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'alerts_teacher_id_fkey'; columns: ['teacher_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'alerts_school_id_fkey'; columns: ['school_id']; referencedRelation: 'schools'; referencedColumns: ['id'] },
        ];
      };
      alert_students: {
        Row: {
          alert_id: string;
          student_id: string;
        };
        Insert: {
          alert_id: string;
          student_id: string;
        };
        Update: {
          alert_id?: string;
          student_id?: string;
        };
        Relationships: [
          { foreignKeyName: 'alert_students_alert_id_fkey'; columns: ['alert_id']; referencedRelation: 'alerts'; referencedColumns: ['id'] },
          { foreignKeyName: 'alert_students_student_id_fkey'; columns: ['student_id']; referencedRelation: 'students'; referencedColumns: ['id'] },
        ];
      };
      notifications: {
        Row: {
          id: string;
          from_user_id: string;
          to_user_id: string | null;
          title: string;
          message: string;
          priority: Database['public']['Enums']['notification_priority'];
          school_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          from_user_id: string;
          to_user_id?: string | null;
          title: string;
          message: string;
          priority?: Database['public']['Enums']['notification_priority'];
          school_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          from_user_id?: string;
          to_user_id?: string | null;
          title?: string;
          message?: string;
          priority?: Database['public']['Enums']['notification_priority'];
          school_id?: string;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'notifications_from_user_id_fkey'; columns: ['from_user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'notifications_to_user_id_fkey'; columns: ['to_user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'notifications_school_id_fkey'; columns: ['school_id']; referencedRelation: 'schools'; referencedColumns: ['id'] },
        ];
      };
      notification_reads: {
        Row: {
          notification_id: string;
          user_id: string;
          read_at: string;
        };
        Insert: {
          notification_id: string;
          user_id: string;
          read_at?: string;
        };
        Update: {
          notification_id?: string;
          user_id?: string;
          read_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'notification_reads_notification_id_fkey'; columns: ['notification_id']; referencedRelation: 'notifications'; referencedColumns: ['id'] },
          { foreignKeyName: 'notification_reads_user_id_fkey'; columns: ['user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      library_materials: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          file_type: Database['public']['Enums']['file_type'];
          file_name: string | null;
          file_size: string | null;
          subject_id: string;
          subject_name: string;
          unit_name: string | null;
          teacher_id: string;
          school_id: string;
          tags: string[];
          uploaded_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          file_type?: Database['public']['Enums']['file_type'];
          file_name?: string | null;
          file_size?: string | null;
          subject_id: string;
          subject_name: string;
          unit_name?: string | null;
          teacher_id: string;
          school_id: string;
          tags?: string[];
          uploaded_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          file_type?: Database['public']['Enums']['file_type'];
          file_name?: string | null;
          file_size?: string | null;
          subject_id?: string;
          subject_name?: string;
          unit_name?: string | null;
          teacher_id?: string;
          school_id?: string;
          tags?: string[];
          uploaded_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'library_materials_subject_id_fkey'; columns: ['subject_id']; referencedRelation: 'subjects'; referencedColumns: ['id'] },
          { foreignKeyName: 'library_materials_teacher_id_fkey'; columns: ['teacher_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'library_materials_school_id_fkey'; columns: ['school_id']; referencedRelation: 'schools'; referencedColumns: ['id'] },
        ];
      };
      planning_units: {
        Row: {
          id: string;
          title: string;
          subject_id: string;
          course_id: string;
          teacher_id: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          subject_id: string;
          course_id: string;
          teacher_id: string;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          subject_id?: string;
          course_id?: string;
          teacher_id?: string;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'planning_units_subject_id_fkey'; columns: ['subject_id']; referencedRelation: 'subjects'; referencedColumns: ['id'] },
          { foreignKeyName: 'planning_units_course_id_fkey'; columns: ['course_id']; referencedRelation: 'courses'; referencedColumns: ['id'] },
          { foreignKeyName: 'planning_units_teacher_id_fkey'; columns: ['teacher_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      planning_classes: {
        Row: {
          id: string;
          unit_id: string;
          title: string;
          sort_order: number;
          objectives: string[];
          content: string | null;
          is_complete: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          unit_id: string;
          title: string;
          sort_order?: number;
          objectives?: string[];
          content?: string | null;
          is_complete?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          unit_id?: string;
          title?: string;
          sort_order?: number;
          objectives?: string[];
          content?: string | null;
          is_complete?: boolean;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'planning_classes_unit_id_fkey'; columns: ['unit_id']; referencedRelation: 'planning_units'; referencedColumns: ['id'] },
        ];
      };
      communications: {
        Row: {
          id: string;
          from_user_id: string;
          subject: string;
          body: string;
          priority: Database['public']['Enums']['notification_priority'];
          school_id: string;
          is_broadcast: boolean;
          sent_at: string;
        };
        Insert: {
          id?: string;
          from_user_id: string;
          subject: string;
          body: string;
          priority?: Database['public']['Enums']['notification_priority'];
          school_id: string;
          is_broadcast?: boolean;
          sent_at?: string;
        };
        Update: {
          id?: string;
          from_user_id?: string;
          subject?: string;
          body?: string;
          priority?: Database['public']['Enums']['notification_priority'];
          school_id?: string;
          is_broadcast?: boolean;
          sent_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'communications_from_user_id_fkey'; columns: ['from_user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'communications_school_id_fkey'; columns: ['school_id']; referencedRelation: 'schools'; referencedColumns: ['id'] },
        ];
      };
      communication_recipients: {
        Row: {
          communication_id: string;
          user_id: string;
        };
        Insert: {
          communication_id: string;
          user_id: string;
        };
        Update: {
          communication_id?: string;
          user_id?: string;
        };
        Relationships: [
          { foreignKeyName: 'communication_recipients_communication_id_fkey'; columns: ['communication_id']; referencedRelation: 'communications'; referencedColumns: ['id'] },
          { foreignKeyName: 'communication_recipients_user_id_fkey'; columns: ['user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      communication_reads: {
        Row: {
          communication_id: string;
          user_id: string;
          read_at: string;
        };
        Insert: {
          communication_id: string;
          user_id: string;
          read_at?: string;
        };
        Update: {
          communication_id?: string;
          user_id?: string;
          read_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'communication_reads_communication_id_fkey'; columns: ['communication_id']; referencedRelation: 'communications'; referencedColumns: ['id'] },
          { foreignKeyName: 'communication_reads_user_id_fkey'; columns: ['user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      quick_notes: {
        Row: {
          id: string;
          text: string;
          teacher_id: string;
          is_pinned: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          text: string;
          teacher_id: string;
          is_pinned?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          text?: string;
          teacher_id?: string;
          is_pinned?: boolean;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'quick_notes_teacher_id_fkey'; columns: ['teacher_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      chat_sessions: {
        Row: {
          id: string;
          teacher_id: string;
          class_id: string | null;
          subject_id: string | null;
          course_id: string | null;
          title: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          class_id?: string | null;
          subject_id?: string | null;
          course_id?: string | null;
          title?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          class_id?: string | null;
          subject_id?: string | null;
          course_id?: string | null;
          title?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'chat_sessions_teacher_id_fkey'; columns: ['teacher_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'chat_sessions_class_id_fkey'; columns: ['class_id']; referencedRelation: 'planning_classes'; referencedColumns: ['id'] },
          { foreignKeyName: 'chat_sessions_subject_id_fkey'; columns: ['subject_id']; referencedRelation: 'subjects'; referencedColumns: ['id'] },
          { foreignKeyName: 'chat_sessions_course_id_fkey'; columns: ['course_id']; referencedRelation: 'courses'; referencedColumns: ['id'] },
        ];
      };
      chat_messages: {
        Row: {
          id: string;
          session_id: string;
          role: Database['public']['Enums']['chat_role'];
          content: string;
          tool_used: Database['public']['Enums']['ia_tool_type'] | null;
          model_used: Database['public']['Enums']['ia_model'] | null;
          token_count: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          role: Database['public']['Enums']['chat_role'];
          content: string;
          tool_used?: Database['public']['Enums']['ia_tool_type'] | null;
          model_used?: Database['public']['Enums']['ia_model'] | null;
          token_count?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          role?: Database['public']['Enums']['chat_role'];
          content?: string;
          tool_used?: Database['public']['Enums']['ia_tool_type'] | null;
          model_used?: Database['public']['Enums']['ia_model'] | null;
          token_count?: number | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'chat_messages_session_id_fkey'; columns: ['session_id']; referencedRelation: 'chat_sessions'; referencedColumns: ['id'] },
        ];
      };
      ia_usage: {
        Row: {
          id: string;
          teacher_id: string;
          usage_date: string;
          message_count: number;
          token_count_in: number;
          token_count_out: number;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          usage_date?: string;
          message_count?: number;
          token_count_in?: number;
          token_count_out?: number;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          usage_date?: string;
          message_count?: number;
          token_count_in?: number;
          token_count_out?: number;
        };
        Relationships: [
          { foreignKeyName: 'ia_usage_teacher_id_fkey'; columns: ['teacher_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      auth_school_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      auth_role: {
        Args: Record<string, never>;
        Returns: Database['public']['Enums']['user_role'];
      };
    };
    Enums: {
      user_role: 'director' | 'docente';
      alert_level: 'danger' | 'warning' | 'info' | 'success';
      alert_category: 'academic' | 'attendance' | 'conduct' | 'system';
      student_status: 'excellent' | 'good' | 'warning' | 'critical';
      day_of_week: 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes';
      notification_priority: 'high' | 'medium' | 'low';
      file_type: 'pdf' | 'doc' | 'image' | 'link';
      chat_role: 'user' | 'assistant' | 'system';
      ia_tool_type: 'act' | 'eval' | 'sum' | 'pres' | 'oral' | 'free';
      ia_model: 'haiku' | 'sonnet';
    };
    CompositeTypes: Record<string, never>;
  };
};

// Helper types for table rows
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];
