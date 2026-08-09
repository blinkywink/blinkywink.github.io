type Props = {
  eyebrow?: string;
  title: string;
  blurb?: string;
};

/** Left-aligned page title — same rhythm as Card Collection. */
export function PageHeader({ eyebrow, title, blurb }: Props) {
  return (
    <header className="page-header">
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1>{title}</h1>
      {blurb ? <p className="page-header__blurb">{blurb}</p> : null}
    </header>
  );
}
