import { useEffect } from "react";
import type { CSSProperties } from "react";

const VARS = [
  "--player-accent",
  "--player-accent-2",
  "--player-accent-r",
  "--player-accent-g",
  "--player-accent-b",
] as const;

/**
 * Tints the whole browser viewport (body) with profile accent while mounted.
 */
export function usePlayerPageAccent(chromeStyle: CSSProperties | null | undefined) {
  const accent = (chromeStyle as Record<string, string> | null | undefined)?.[
    "--player-accent"
  ];

  useEffect(() => {
    if (!accent || !chromeStyle) return;
    const root = document.documentElement;
    const body = document.body;
    const style = chromeStyle as Record<string, string>;

    for (const key of VARS) {
      const value = style[key];
      if (value != null) root.style.setProperty(key, String(value));
    }
    body.classList.add("has-player-page-accent");

    return () => {
      body.classList.remove("has-player-page-accent");
      for (const key of VARS) root.style.removeProperty(key);
    };
  }, [
    accent,
    (chromeStyle as Record<string, string> | null | undefined)?.[
      "--player-accent-r"
    ],
    (chromeStyle as Record<string, string> | null | undefined)?.[
      "--player-accent-g"
    ],
    (chromeStyle as Record<string, string> | null | undefined)?.[
      "--player-accent-b"
    ],
  ]);
}
