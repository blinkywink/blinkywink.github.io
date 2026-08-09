export type Profile = {
  id: string;
  username: string;
  /** Cash — current spendable balance. */
  coins: number;
  /** Lifetime Cash earned (never decreases on spend). */
  coins_earned: number;
  /** Unused premium currency column (kept in DB; not shown in UI). */
  monkey_money: number;
  /** UTC date (YYYY-MM-DD) of last daily claim, or null. */
  last_daily_claim: string | null;
  created_at: string;
  updated_at: string;
};

export type OwnedCard = {
  user_id: string;
  card_id: string;
  obtained_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          username: string;
          coins?: number;
          coins_earned?: number;
          monkey_money?: number;
          last_daily_claim?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          username?: string;
          coins?: number;
          coins_earned?: number;
          monkey_money?: number;
          last_daily_claim?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      owned_cards: {
        Row: OwnedCard;
        Insert: {
          user_id: string;
          card_id: string;
          obtained_at?: string;
        };
        Update: {
          obtained_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      award_coins: {
        Args: { p_amount: number };
        Returns: number;
      };
      spend_coins: {
        Args: { p_amount: number };
        Returns: number;
      };
      award_cards: {
        Args: { p_card_ids: string[] };
        Returns: string[];
      };
      get_player_cards: {
        Args: { p_user_id: string };
        Returns: string[];
      };
      get_profile_by_username: {
        Args: { p_username: string };
        Returns: { id: string; username: string }[];
      };
      claim_daily_cash: {
        Args: Record<string, never>;
        Returns: {
          amount: number;
          coins: number;
          last_daily_claim: string;
        };
      };
      username_signup: {
        Args: { p_username: string; p_password: string };
        Returns: {
          access_token: string;
          user_id: string;
          username: string;
          expires_at: number;
        };
      };
      username_signin: {
        Args: { p_username: string; p_password: string };
        Returns: {
          access_token: string;
          user_id: string;
          username: string;
          expires_at: number;
        };
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
