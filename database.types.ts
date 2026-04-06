export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

export type Database = {
    // Allows to automatically instantiate createClient with right options
    // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
    __InternalSupabase: {
        PostgrestVersion: '13.0.4';
    };
    public: {
        Tables: {
            cinemas: {
                Row: {
                    created_at: string;
                    id: number;
                    last_updated: string;
                    location: string | null;
                    name: string;
                };
                Insert: {
                    created_at?: string;
                    id?: number;
                    last_updated?: string;
                    location?: string | null;
                    name: string;
                };
                Update: {
                    created_at?: string;
                    id?: number;
                    last_updated?: string;
                    location?: string | null;
                    name?: string;
                };
                Relationships: [];
            };
            film_showings: {
                Row: {
                    cinema_id: number;
                    created_at: string | null;
                    end_time: string | null;
                    film_id: number;
                    id: number;
                    start_time: string;
                    url: string | null;
                };
                Insert: {
                    cinema_id: number;
                    created_at?: string | null;
                    end_time?: string | null;
                    film_id: number;
                    id?: number;
                    start_time: string;
                    url?: string | null;
                };
                Update: {
                    cinema_id?: number;
                    created_at?: string | null;
                    end_time?: string | null;
                    film_id?: number;
                    id?: number;
                    start_time?: string;
                    url?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: 'film_showings_cinema_id_fkey';
                        columns: ['cinema_id'];
                        isOneToOne: false;
                        referencedRelation: 'cinemas';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'film_showings_film_id_fkey';
                        columns: ['film_id'];
                        isOneToOne: false;
                        referencedRelation: 'films';
                        referencedColumns: ['id'];
                    },
                ];
            };
            films: {
                Row: {
                    created_at: string;
                    duration_minutes: number | null;
                    id: number;
                    local_id: string | null;
                    title: string;
                    tmdb_id: number | null;
                };
                Insert: {
                    created_at?: string;
                    duration_minutes?: number | null;
                    id?: number;
                    local_id?: string | null;
                    title: string;
                    tmdb_id?: number | null;
                };
                Update: {
                    created_at?: string;
                    duration_minutes?: number | null;
                    id?: number;
                    local_id?: string | null;
                    title?: string;
                    tmdb_id?: number | null;
                };
                Relationships: [
                    {
                        foreignKeyName: 'films_tmdb_id_fkey';
                        columns: ['tmdb_id'];
                        isOneToOne: false;
                        referencedRelation: 'tmdb_films';
                        referencedColumns: ['id'];
                    },
                ];
            };
            new_cinemas: {
                Row: {
                    coordinates: Json | null;
                    created_at: string;
                    id: number;
                    last_updated: string;
                    location: string;
                    name: string;
                };
                Insert: {
                    coordinates?: Json | null;
                    created_at?: string;
                    id?: number;
                    last_updated: string;
                    location: string;
                    name: string;
                };
                Update: {
                    coordinates?: Json | null;
                    created_at?: string;
                    id?: number;
                    last_updated?: string;
                    location?: string;
                    name?: string;
                };
                Relationships: [];
            };
            new_films: {
                Row: {
                    cinema_id: number;
                    country: string | null;
                    cover_url: string | null;
                    created_at: string;
                    director: string | null;
                    duration: number | null;
                    id: number;
                    language: string | null;
                    local_id: string | null;
                    release_year: number | null;
                    title: string;
                    tmdb_id: number | null;
                    url: string | null;
                };
                Insert: {
                    cinema_id: number;
                    country?: string | null;
                    cover_url?: string | null;
                    created_at?: string;
                    director?: string | null;
                    duration?: number | null;
                    id?: number;
                    language?: string | null;
                    local_id?: string | null;
                    release_year?: number | null;
                    title: string;
                    tmdb_id?: number | null;
                    url?: string | null;
                };
                Update: {
                    cinema_id?: number;
                    country?: string | null;
                    cover_url?: string | null;
                    created_at?: string;
                    director?: string | null;
                    duration?: number | null;
                    id?: number;
                    language?: string | null;
                    local_id?: string | null;
                    release_year?: number | null;
                    title?: string;
                    tmdb_id?: number | null;
                    url?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: 'new_films_cinema_id_fkey';
                        columns: ['cinema_id'];
                        isOneToOne: false;
                        referencedRelation: 'new_cinemas';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'new_films_tmdb_id_fkey';
                        columns: ['tmdb_id'];
                        isOneToOne: false;
                        referencedRelation: 'tmdb_films';
                        referencedColumns: ['id'];
                    },
                ];
            };
            new_showings: {
                Row: {
                    booking_url: string | null;
                    cinema_id: number;
                    created_at: string;
                    end_time: string | null;
                    film_id: number;
                    id: number;
                    start_time: string;
                    tmdb_id: number | null;
                };
                Insert: {
                    booking_url?: string | null;
                    cinema_id: number;
                    created_at?: string;
                    end_time?: string | null;
                    film_id: number;
                    id?: number;
                    start_time: string;
                    tmdb_id?: number | null;
                };
                Update: {
                    booking_url?: string | null;
                    cinema_id?: number;
                    created_at?: string;
                    end_time?: string | null;
                    film_id?: number;
                    id?: number;
                    start_time?: string;
                    tmdb_id?: number | null;
                };
                Relationships: [
                    {
                        foreignKeyName: 'new_showings_cinema_id_fkey';
                        columns: ['cinema_id'];
                        isOneToOne: false;
                        referencedRelation: 'new_cinemas';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'new_showings_film_id_fkey';
                        columns: ['film_id'];
                        isOneToOne: false;
                        referencedRelation: 'new_films';
                        referencedColumns: ['id'];
                    },
                ];
            };
            tmdb_films: {
                Row: {
                    adult: boolean;
                    backdrop_path: string | null;
                    created_at: string;
                    genre_ids: number[];
                    id: number;
                    letterboxd_avg_rating: number | null;
                    letterboxd_num_ratings: number | null;
                    letterboxd_ratings: Json | null;
                    letterboxd_slug: string | null;
                    original_language: string;
                    original_title: string;
                    overview: string;
                    popularity: number;
                    poster_path: string | null;
                    release_date: string;
                    title: string;
                    video: boolean;
                    vote_average: number;
                    vote_count: number;
                };
                Insert: {
                    adult: boolean;
                    backdrop_path?: string | null;
                    created_at?: string;
                    genre_ids: number[];
                    id: number;
                    letterboxd_avg_rating?: number | null;
                    letterboxd_num_ratings?: number | null;
                    letterboxd_ratings?: Json | null;
                    letterboxd_slug?: string | null;
                    original_language: string;
                    original_title: string;
                    overview: string;
                    popularity: number;
                    poster_path?: string | null;
                    release_date: string;
                    title: string;
                    video: boolean;
                    vote_average: number;
                    vote_count: number;
                };
                Update: {
                    adult?: boolean;
                    backdrop_path?: string | null;
                    created_at?: string;
                    genre_ids?: number[];
                    id?: number;
                    letterboxd_avg_rating?: number | null;
                    letterboxd_num_ratings?: number | null;
                    letterboxd_ratings?: Json | null;
                    letterboxd_slug?: string | null;
                    original_language?: string;
                    original_title?: string;
                    overview?: string;
                    popularity?: number;
                    poster_path?: string | null;
                    release_date?: string;
                    title?: string;
                    video?: boolean;
                    vote_average?: number;
                    vote_count?: number;
                };
                Relationships: [];
            };
        };
        Views: {
            [_ in never]: never;
        };
        Functions: {
            [_ in never]: never;
        };
        Enums: {
            [_ in never]: never;
        };
        CompositeTypes: {
            [_ in never]: never;
        };
    };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
    keyof Database,
    'public'
>];

export type Tables<
    DefaultSchemaTableNameOrOptions extends
        | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
        | { schema: keyof DatabaseWithoutInternals },
    TableName extends DefaultSchemaTableNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals;
    }
        ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
              DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
        : never = never,
> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
}
    ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
          DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
          Row: infer R;
      }
        ? R
        : never
    : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
            DefaultSchema['Views'])
      ? (DefaultSchema['Tables'] &
            DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
            Row: infer R;
        }
          ? R
          : never
      : never;

export type TablesInsert<
    DefaultSchemaTableNameOrOptions extends
        | keyof DefaultSchema['Tables']
        | { schema: keyof DatabaseWithoutInternals },
    TableName extends DefaultSchemaTableNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals;
    }
        ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
        : never = never,
> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
}
    ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
          Insert: infer I;
      }
        ? I
        : never
    : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
      ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
            Insert: infer I;
        }
          ? I
          : never
      : never;

export type TablesUpdate<
    DefaultSchemaTableNameOrOptions extends
        | keyof DefaultSchema['Tables']
        | { schema: keyof DatabaseWithoutInternals },
    TableName extends DefaultSchemaTableNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals;
    }
        ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
        : never = never,
> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
}
    ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
          Update: infer U;
      }
        ? U
        : never
    : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
      ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
            Update: infer U;
        }
          ? U
          : never
      : never;

export type Enums<
    DefaultSchemaEnumNameOrOptions extends
        | keyof DefaultSchema['Enums']
        | { schema: keyof DatabaseWithoutInternals },
    EnumName extends DefaultSchemaEnumNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals;
    }
        ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
        : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
}
    ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
    : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
      ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
      : never;

export type CompositeTypes<
    PublicCompositeTypeNameOrOptions extends
        | keyof DefaultSchema['CompositeTypes']
        | { schema: keyof DatabaseWithoutInternals },
    CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals;
    }
        ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
        : never = never,
> = PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
}
    ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
    : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
      ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
      : never;

export const Constants = {
    public: {
        Enums: {},
    },
} as const;
