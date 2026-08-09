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
      marketplace_listings: {
        Row: {
          id: string;
          seller_id: string;
          card_id: string;
          price: number;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          seller_id: string;
          card_id: string;
          price: number;
          status?: string;
          created_at?: string;
        };
        Update: {
          status?: string;
          price?: number;
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
      list_card_for_sale: {
        Args: { p_card_id: string; p_price: number };
        Returns: string;
      };
      cancel_listing: {
        Args: { p_listing_id: string };
        Returns: boolean;
      };
      buy_listing: {
        Args: { p_listing_id: string };
        Returns: number;
      };
      request_trade: {
        Args: { p_username: string };
        Returns: string;
      };
      respond_trade: {
        Args: { p_trade_id: string; p_accept: boolean };
        Returns: string;
      };
      cancel_trade: {
        Args: { p_trade_id: string };
        Returns: boolean;
      };
      get_trade_inbox: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      get_trade: {
        Args: { p_trade_id: string };
        Returns: unknown;
      };
      set_trade_offer: {
        Args: { p_trade_id: string; p_card_ids: string[] };
        Returns: boolean;
      };
      set_trade_ready: {
        Args: { p_trade_id: string; p_ready: boolean };
        Returns: unknown;
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
