const copyBtn = document.getElementById("copy-code");
const statusEl = document.getElementById("copy-status");

async function copyCreatorCode() {
  const code = "blinky";
  try {
    await navigator.clipboard.writeText(code);
    statusEl.textContent = "Copied — paste it in the BTD6 shop";
  } catch {
    statusEl.textContent = "Code is blinky — copy it manually";
  }
}

copyBtn?.addEventListener("click", copyCreatorCode);

const revealTargets = document.querySelectorAll(".section, .footer");
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12 }
  );

  for (const el of revealTargets) {
    el.classList.add("will-reveal");
    io.observe(el);
  }
}
