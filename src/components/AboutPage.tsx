import { Link } from "react-router-dom";
import { SITE_NAME } from "../lib/brand";
import { DISCORD_INVITE_URL, YOUTUBE_CHANNEL_URL } from "../lib/openExternal";
import { ExternalLink } from "./ExternalLink";

export function AboutPage() {
  return (
    <article className="about-page">
      <header className="about-page__header">
        <Link to="/" className="about-page__back">
          ← Home
        </Link>
        <h1>About {SITE_NAME}</h1>
        <p className="about-page__lede">
          A free fan-made card collection game built around Bloons TD 6 towers,
          paths, and minigames.
        </p>
      </header>

      <section className="about-page__section">
        <h2>How it works</h2>
        <ul>
          <li>
            Play BTD6-themed minigames to earn in-game cash and bonus rewards.
          </li>
          <li>
            Spend cash in the shop on booster packs and open them to collect
            tower cards.
          </li>
          <li>
            Build out your collection, climb the leaderboard, and trade with
            other players on the marketplace.
          </li>
          <li>
            Create an account to save progress across devices, or try it as a
            guest first.
          </li>
        </ul>
        <p>
          The featured shop rotates daily. Some cards are rarer than others,
          and paragon cards sit at the top of the rarity ladder.
        </p>
      </section>

      <section className="about-page__section">
        <h2>Free — no sales</h2>
        <p>
          {SITE_NAME} is completely free. There are no real-money purchases, no
          subscriptions, and nothing for sale on this site. All coins, packs, and
          cards exist only inside the game.
        </p>
      </section>

      <section className="about-page__section">
        <h2>Fan project — not affiliated with Ninja Kiwi</h2>
        <p>
          This is an unofficial fan project made by{" "}
          <ExternalLink href={YOUTUBE_CHANNEL_URL}>blinkywink</ExternalLink>.
          It is not affiliated with, endorsed by, or connected to Ninja Kiwi in
          any way.
        </p>
        <p>
          <em>Bloons TD 6</em> and related names, art, and assets belong to
          their respective owners. {SITE_NAME} is a non-commercial fan
          experience made for the community.
        </p>
      </section>

      <section className="about-page__section">
        <h2>Desktop app</h2>
        <p>
          You can play in the browser or download the optional desktop app for
          Mac and Windows. The desktop build is the same game with faster
          loading — it still talks to the same online account and collection.
        </p>
      </section>

      <section className="about-page__section">
        <h2>Questions or feedback</h2>
        <p>
          The best place to reach me is the{" "}
          <ExternalLink href={DISCORD_INVITE_URL}>Discord server</ExternalLink>.
          If you enjoy the project, using creator code <strong>blinky</strong> in
          BTD6 is always appreciated — but it has nothing to do with this site.
        </p>
      </section>
    </article>
  );
}
