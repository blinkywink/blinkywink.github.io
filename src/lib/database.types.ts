export type Profile = {
  id: string;
  username: string;
  /** Cash — current spendable balance. */
  coins: number;
  /** Lifetime Cash earned (never decreases on spend). */
  coins_earned: number;
  /** Unused premium currency column (kept in DB; not shown in UI). */
  monkey_money: number;
  /** UTC date (YYYY-MM-DD) of last daily Cash claim, or null. */
  last_daily_claim: string | null;
  /** UTC date (YYYY-MM-DD) of last daily card claim, or null. */
  last_daily_card_claim?: string | null;
  /** Owned card id used as profile picture, or null. */
  avatar_card_id: string | null;
  avatar_zoom: number;
  avatar_x: number;
  avatar_y: number;
  /** Up to 3 owned card ids shown on the public collection page. */
  showcase_card_ids?: string[] | null;
  /** Purchased showcase slot capacity (0–3). */
  showcase_slots?: number | null;
  /** One-time unlock for custom profile accent color. */
  accent_unlocked?: boolean | null;
  /** Hex `#RRGGBB` accent, or null. */
  accent_color?: string | null;
  /** One-time unlock for profile aura FX. */
  aura_unlocked?: boolean | null;
  /** Owned card id whose FX palette is copied onto profile chrome. */
  aura_card_id?: string | null;
  /** Unlocked shoppable hero ids. */
  owned_hero_ids?: string[] | null;
  /** Currently equipped hero id, or null. */
  equipped_hero_id?: string | null;
  /** Per-hero levels, e.g. `{ "quincy": 1 }`. */
  hero_levels?: Record<string, number> | null;
  /** Clears toward next paid level-up while that hero is equipped. */
  hero_clear_progress?: Record<string, number> | null;
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
          last_daily_card_claim?: string | null;
          avatar_card_id?: string | null;
          avatar_zoom?: number;
          avatar_x?: number;
          avatar_y?: number;
          showcase_card_ids?: string[] | null;
          showcase_slots?: number;
          accent_unlocked?: boolean;
          accent_color?: string | null;
          aura_unlocked?: boolean;
          aura_card_id?: string | null;
          owned_hero_ids?: string[] | null;
          equipped_hero_id?: string | null;
          hero_levels?: Record<string, number> | null;
          hero_clear_progress?: Record<string, number> | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          username?: string;
          coins?: number;
          coins_earned?: number;
          monkey_money?: number;
          last_daily_claim?: string | null;
          last_daily_card_claim?: string | null;
          avatar_card_id?: string | null;
          avatar_zoom?: number;
          avatar_x?: number;
          avatar_y?: number;
          showcase_card_ids?: string[] | null;
          showcase_slots?: number;
          accent_unlocked?: boolean;
          accent_color?: string | null;
          aura_unlocked?: boolean;
          aura_card_id?: string | null;
          owned_hero_ids?: string[] | null;
          equipped_hero_id?: string | null;
          hero_levels?: Record<string, number> | null;
          hero_clear_progress?: Record<string, number> | null;
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
      marketplace_offers: {
        Row: {
          id: string;
          listing_id: string;
          buyer_id: string;
          offer_price: number;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          buyer_id: string;
          offer_price: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: string;
          offer_price?: number;
          updated_at?: string;
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
      get_shop_direct_listings: {
        Args: Record<string, never>;
        Returns: {
          slot: number;
          cardId: string;
          tier: number;
          price: number;
          version: number;
          updatedAt: string;
        }[];
      };
      buy_shop_direct_card: {
        Args: { p_slot: number; p_version: number };
        Returns: {
          ok: boolean;
          boughtCardId: string;
          boughtTier: number;
          price: number;
          coins: number;
          listings: unknown;
        };
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
        Returns: {
          id: string;
          username: string;
          avatar_card_id: string | null;
          avatar_zoom: number;
          avatar_x: number;
          avatar_y: number;
          showcase_card_ids: string[] | null;
          accent_color: string | null;
          aura_card_id: string | null;
          owned_hero_ids: string[] | null;
          equipped_hero_id: string | null;
          hero_levels: Record<string, number> | null;
        }[];
      };
      buy_hero: {
        Args: { p_hero_id: string };
        Returns: {
          coins: number;
          owned_hero_ids: string[];
          hero_levels: Record<string, number>;
          hero_clear_progress: Record<string, number>;
          equipped_hero_id: string | null;
        };
      };
      record_hero_clear: {
        Args: Record<string, never>;
        Returns: {
          hero_id: string | null;
          progress: number;
          required: number;
          ready: boolean;
          hero_clear_progress: Record<string, number>;
        };
      };
      equip_hero: {
        Args: { p_hero_id: string | null };
        Returns: {
          coins: number;
          equipped_hero_id: string | null;
        };
      };
      set_profile_showcase: {
        Args: { p_card_ids: string[] };
        Returns: number;
      };
      buy_showcase_slot: {
        Args: Record<string, never>;
        Returns: number;
      };
      set_profile_accent: {
        Args: { p_color: string };
        Returns: number;
      };
      set_profile_aura: {
        Args: { p_card_id: string | null };
        Returns: number;
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
      make_listing_offer: {
        Args: { p_listing_id: string; p_offer_price: number };
        Returns: string;
      };
      respond_listing_offer: {
        Args: { p_offer_id: string; p_accept: boolean };
        Returns: number | null;
      };
      get_market_offer_inbox: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      get_listing_offers: {
        Args: { p_listing_id: string };
        Returns: unknown;
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
      set_profile_avatar: {
        Args: {
          p_card_id: string | null;
          p_zoom: number;
          p_x: number;
          p_y: number;
        };
        Returns: boolean;
      };
      claim_daily_cash: {
        Args: Record<string, never>;
        Returns: {
          amount: number;
          coins: number;
          last_daily_claim: string;
        };
      };
      claim_daily_card: {
        Args: Record<string, never>;
        Returns: {
          last_daily_card_claim: string;
        };
      };
      record_bloonhero_play: {
        Args: {
          p_md5: string;
          p_chart_id: number | null;
          p_song_name: string;
          p_artist: string;
          p_album_art_md5?: string | null;
          p_charter?: string | null;
          p_song_length?: number | null;
        };
        Returns: boolean;
      };
      get_bloonhero_recent_plays: {
        Args: { p_limit?: number };
        Returns: {
          id: number;
          user_id: string | null;
          username: string;
          md5: string;
          chart_id: number | null;
          song_name: string;
          artist: string;
          album_art_md5: string | null;
          charter: string | null;
          song_length: number | null;
          played_at: string;
        }[];
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
