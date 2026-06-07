(() => {
  const QUIZ_LENGTH = 10;
  const QUIZ_IMAGE_WIDTH = 800;
  const MOBILE_MQ = window.matchMedia("(max-width: 860px)");

  const NO_IMAGE =
    "https://static.wikia.nocookie.net/fortnite/images/8/84/Noimage.jpg/revision/latest/scale-to-width-down/450?cb=20260319010138";

  const QUIZ_META = {
    episode: {
      title: "Season Quiz",
      prompt: "Which season is this?",
      kindLabel: "Season",
    },
    character: {
      title: "Outfit Quiz",
      prompt: "Which outfit is this?",
      kindLabel: "Outfit",
    },
    set: {
      title: "Cosmetic Quiz",
      prompt: "What is this cosmetic?",
      kindLabel: "Cosmetic",
    },
    weapon: {
      title: "Weapon Quiz",
      prompt: "What weapon is this?",
      kindLabel: "Weapon",
    },
    map: {
      title: "Map Quiz",
      prompt: "Which map or island is this?",
      kindLabel: "Map",
    },
    item: {
      title: "Item Quiz",
      prompt: "What is this item?",
      kindLabel: "Item",
    },
    combo: {
      title: "Mixed Quiz",
      prompt: "",
      kindLabel: "Mixed",
    },
    hard: {
      title: "Super Hard Quiz",
      prompt: "",
      kindLabel: "Super Hard",
    },
  };

  const HARD_QUIZ_LENGTH = 15;
  const HARD_OPTION_COUNT = 6;
  const HARD_POOL_MIN = 7;

  const BASE_QUIZ_TYPES = ["episode", "character", "set", "weapon", "map", "item"];
  const WEAPON_MIN_IMAGES = 1;
  const MULTI_IMAGE_POOL_MIN = 12;
  const CHARACTER_MIN_IMAGES = MULTI_IMAGE_POOL_MIN;
  const EPISODE_MIN_IMAGES = MULTI_IMAGE_POOL_MIN;
  const MAP_MIN_IMAGES = MULTI_IMAGE_POOL_MIN;
  const MULTI_IMAGE_COUNT = 3;
  const SINGLE_IMAGE_TYPES = new Set(["set", "weapon", "item"]);
  const EPISODE_NAV_IMAGE = /Nav_Seasons/i;
  const EPISODE_IMAGE_JUNK =
    /_-_Weapon_-_Fortnite|Outfit_-_Fortnite|Glider_-_Fortnite|Pickaxe_-_Fortnite|Emote_-_Fortnite|Emoticon_-_Fortnite|Wrap_-_Fortnite|Back_Bling|Arrow_Right|V-Bucks|xp_boost|Schematic|Ammo_-_Fortnite|Trap_-_Fortnite|Item_-_Fortnite|Quests_-_|Challenges_-_Icon|Battle_Pass.*Icon|Banners-Icons|Hashflag|Free_Pass|Free_Challenges|Season_XP|Personal_xp|Friend_xp|Daily_Quests/i;
  const EPISODE_IMAGE_GOOD =
    /Key[_ -]?Art|Keyart|Loading[_ ]Screen|_-_Logo_-_|Teaser|Lobby_Background|Lobby_Screen|Promo_-_Fortnite|Trailer|Full\)|_\(Full\)|Event_-_Fortnite|Battle_Pass_-_Fortnite|Chapter.*Loading|Chapter.*Key|Remix/i;
  const EPISODE_IMAGES_PER_QUESTION = 3;
  const EPISODE_QUIZ_MIN_IMAGES = 3;
  const EPISODE_GIVEAWAY_IMAGE =
    /Key[_ -]?Art|Keyart|_-_Logo_-_|Battle_Pass_-_Fortnite|Lobby_Screen|Lobby_Background/i;
  const CHARACTER_JUNK = /Fall_Guys|Hashflag/i;
  const MAP_JUNK =
    /Spray|Emoticon|Emote|Back_Bling|Arrow_Right|Outfit|Glider|Wrap|Pickaxe|Hashflag|disambig|Schematic_-_Icon|Question_-_Icon/i;
  const MAP_GOOD = /Island|Location|Map|Landmark|Promo.*Ballistic/i;
  const ITEM_WEAPON_HREF =
    /\/weapons-battle-royale\/|\/weaponry|\/assault-weapons|\/shotguns\/|\/sniper-rifles|\/submachine-guns|\/bows\/|\/crossbows\/|\/melee-weapons|\/explosive-weapons|\/ranged-weapons|\/marksman-rifles|\/pistols\/|\/ballistic\/|\/vehicles\//i;
  const ITEM_WEAPON_IMAGE =
    /_-_Weapon_-_Fortnite|Weapon_-_Ballistic|_-_Vehicle_-_Fortnite|Outfit_-_Fortnite|Emote_-_Fortnite|Pickaxe_-_Fortnite|Glider_-_Fortnite|Wrap_-_Fortnite|Back_Bling|Schematic_-_Icon|Question_-_Icon|Hashflag/i;
  const ITEM_POOL_GOOD =
    /_-_Item_-_Fortnite|_-_Trap_-_Fortnite|_-_Ammo_-_Fortnite|_-_Resource_-_Fortnite|_-_Ingredient_-_Fortnite|_-_Power_-_Fortnite/i;

  const episodeImages = (row) =>
    (row?.images || []).filter((url) => {
      const d = decodeURIComponent(url);
      if (EPISODE_NAV_IMAGE.test(d) || EPISODE_IMAGE_JUNK.test(d)) return false;
      return EPISODE_IMAGE_GOOD.test(d);
    });

  const isEpisodeGiveawayImage = (url) =>
    EPISODE_GIVEAWAY_IMAGE.test(decodeURIComponent(url));

  /** Season quiz clues — loading screens, teasers, promos (not key art / logos). */
  const episodeQuizImages = (row) =>
    episodeImages(row).filter((url) => !isEpisodeGiveawayImage(url));

  const pickWithPrimaryImage = (pool, count) => {
    if (!pool.length) return [];
    const primary = pool[0];
    if (count <= 1) return [primary];
    const rest = pool.slice(1);
    const extras = sample(rest, Math.min(count - 1, rest.length));
    return [primary, ...extras];
  };

  const characterImages = (row) =>
    (row?.images || []).filter((url) => !CHARACTER_JUNK.test(decodeURIComponent(url)));

  const mapImages = (row) => {
    const good = (row?.images || []).filter((url) => {
      const d = decodeURIComponent(url);
      if (MAP_JUNK.test(d)) return false;
      return MAP_GOOD.test(d);
    });
    return good.length ? good : row?.images || [];
  };

  const isItemQuizRow = (row) => {
    const href = row?.href || "";
    if (ITEM_WEAPON_HREF.test(href)) return false;
    return itemImages(row).length >= 1;
  };

  const itemImages = (row) => {
    const pool = (row?.images || []).filter((url) => {
      const d = decodeURIComponent(url);
      if (ITEM_WEAPON_IMAGE.test(d)) return false;
      return ITEM_POOL_GOOD.test(d);
    });
    return pool;
  };

  const quizImagesForRow = (type, row) => {
    if (type === "episode") return episodeQuizImages(row);
    if (type === "character") return characterImages(row);
    if (type === "map") return mapImages(row);
    if (type === "item") return itemImages(row);
    return row?.images || [];
  };

  const primaryQuestionImage = (type, row) => quizImagesForRow(type, row)[0] || null;

  const pickQuestionImages = (type, row) => {
    if (type === "episode") {
      return pickWithPrimaryImage(episodeQuizImages(row), EPISODE_IMAGES_PER_QUESTION);
    }
    const pool = quizImagesForRow(type, row);
    if (!pool.length) return [];
    if (SINGLE_IMAGE_TYPES.has(type)) return [pool[0]];
    if (type === "character") {
      return pickWithPrimaryImage(characterImages(row), MULTI_IMAGE_COUNT);
    }
    return pickWithPrimaryImage(pool, MULTI_IMAGE_COUNT);
  };

  const pickHardQuestionImages = (type, row) => {
    const primary = primaryQuestionImage(type, row);
    return primary ? [primary] : [];
  };

  const answerSimilarity = (correct, candidate) => {
    const tokenize = (value) =>
      new Set(
        String(value)
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/)
          .filter((token) => token.length >= 2),
      );
    const correctTokens = tokenize(correct);
    const candidateTokens = tokenize(candidate);
    if (!correctTokens.size || !candidateTokens.size) return 0;
    let shared = 0;
    correctTokens.forEach((token) => {
      if (candidateTokens.has(token)) shared += token.length;
    });
    const a = correct.toLowerCase();
    const b = candidate.toLowerCase();
    let prefix = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
      if (a[i] === b[i]) prefix += 1;
      else break;
    }
    return shared * 2 + prefix;
  };

  const pickHardDistractors = (correct, others, count, fallbackRows = []) => {
    const seen = new Set([correct]);
    const unique = [];
    others.forEach((row) => {
      if (!row?.display || seen.has(row.display)) return;
      seen.add(row.display);
      unique.push(row);
    });
    const scored = unique
      .map((row) => ({
        display: row.display,
        score: answerSimilarity(correct, row.display) + Math.random() * 0.35,
      }))
      .sort((a, b) => b.score - a.score);
    const picks = sample(
      scored.slice(0, Math.min(scored.length, Math.max(count * 3, count))),
      count,
    ).map((entry) => entry.display);
    if (picks.length >= count) return picks;

    const extras = [];
    fallbackRows.forEach((row) => {
      if (!row?.display || row.display === correct || picks.includes(row.display)) return;
      if (seen.has(row.display)) return;
      seen.add(row.display);
      extras.push(row.display);
    });
    return [...picks, ...sample(extras, count - picks.length)];
  };

  const questionHasImages = (type, row, hard = false) =>
    (hard ? pickHardQuestionImages(type, row) : pickQuestionImages(type, row)).length > 0;

  const hub = document.getElementById("trivia-hub");
  const quizEl = document.getElementById("trivia-quiz");
  const resultsEl = document.getElementById("trivia-results");
  const loadStatus = document.getElementById("trivia-load-status");
  const cardsRoot = document.getElementById("trivia-cards");
  const backBtn = document.getElementById("trivia-back");
  const progressBar = document.getElementById("trivia-progress-bar");
  const progressText = document.getElementById("trivia-progress-text");
  const questionShell = document.getElementById("trivia-question-shell");
  let imagesEl = document.getElementById("trivia-images");
  const questionEl = document.getElementById("trivia-question");
  const optionsEl = document.getElementById("trivia-options");
  const feedbackEl = document.getElementById("trivia-feedback");
  const feedbackScrim = document.getElementById("trivia-feedback-scrim");
  const resultsScore = document.getElementById("trivia-results-score");
  const resultsTitle = document.getElementById("trivia-results-title");
  const resultsList = document.getElementById("trivia-results-list");
  const resultsCard = document.getElementById("trivia-results-card");
  const retryBtn = document.getElementById("trivia-retry");
  const homeBtn = document.getElementById("trivia-home");
  const nextBtn = document.getElementById("trivia-next");

  if (!hub || !cardsRoot) return;

  let pool = null;
  let quizType = null;
  let quizLength = QUIZ_LENGTH;
  let questions = [];
  let qIndex = 0;
  let score = 0;
  let answers = [];
  let locked = false;
  let feedbackTimer = null;
  let scrimFadeTimer = null;
  let nextGlowTimer = null;
  let imageRenderGen = 0;
  const FEEDBACK_MS = 1800;
  const SCRIM_FADE_MS = 400;

  const hideFeedback = (afterHide) => {
    clearTimeout(feedbackTimer);
    clearTimeout(scrimFadeTimer);
    feedbackTimer = null;
    scrimFadeTimer = null;
    questionShell?.classList.remove("is-feedback-active");
    if (feedbackEl) {
      feedbackEl.classList.remove("is-visible", "is-correct", "is-wrong");
      feedbackEl.textContent = "";
      feedbackEl.className = "trivia-feedback-toast";
      feedbackEl.hidden = true;
    }
    if (feedbackScrim) {
      feedbackScrim.classList.remove("is-visible");
      feedbackScrim.setAttribute("aria-hidden", "true");
      scrimFadeTimer = window.setTimeout(() => {
        scrimFadeTimer = null;
        feedbackScrim.hidden = true;
        if (afterHide) afterHide();
      }, SCRIM_FADE_MS);
      return;
    }
    if (afterHide) afterHide();
  };

  const showFeedback = (correct, afterFeedback) => {
    if (!feedbackEl) return;
    clearTimeout(feedbackTimer);
    clearTimeout(scrimFadeTimer);
    feedbackTimer = null;
    scrimFadeTimer = null;
    feedbackEl.textContent = correct ? "Correct!" : "Incorrect";
    feedbackEl.className = `trivia-feedback-toast ${correct ? "is-correct" : "is-wrong"}`;
    feedbackEl.hidden = false;
    if (feedbackScrim) {
      feedbackScrim.hidden = false;
      feedbackScrim.setAttribute("aria-hidden", "false");
    }
    questionShell?.classList.add("is-feedback-active");
    requestAnimationFrame(() => {
      feedbackEl.classList.add("is-visible");
      feedbackScrim?.classList.add("is-visible");
    });
    feedbackTimer = window.setTimeout(() => hideFeedback(afterFeedback), FEEDBACK_MS);
  };

  const shuffle = (arr) => {
    const list = arr.slice();
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };

  const sample = (arr, n) => shuffle(arr).slice(0, Math.min(n, arr.length));

  const normalizeQuizImageUrl = (raw, width = QUIZ_IMAGE_WIDTH) => {
    const s = String(raw || "").trim();
    if (!s) return "";
    if (!s.startsWith("http")) return s;
    if (/\/scale-to-width-down\/\d+/i.test(s)) {
      return s.replace(/\/scale-to-width-down\/\d+/gi, `/scale-to-width-down/${width}`);
    }
    if (/\/scale-to-width\/\d+/i.test(s)) {
      return s.replace(/\/scale-to-width\/\d+/gi, `/scale-to-width/${width}`);
    }
    const q = s.indexOf("?");
    if (q === -1) return `${s}/scale-to-width-down/${width}`;
    return `${s.slice(0, q)}/scale-to-width-down/${width}${s.slice(q)}`;
  };

  const quizImageCandidates = (raw, width = QUIZ_IMAGE_WIDTH) => {
    const urls = [];
    const add = (value) => {
      const primary = normalizeQuizImageUrl(value, width);
      if (primary && !urls.includes(primary)) urls.push(primary);
      const rawUrl = String(value || "").trim();
      if (rawUrl.startsWith("http") && !urls.includes(rawUrl)) urls.push(rawUrl);
    };
    add(raw);
    if (!urls.includes(NO_IMAGE)) urls.push(NO_IMAGE);
    return urls;
  };

  const prefetchImages = (urls) => {
    (urls || []).forEach((raw) => {
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      img.src = normalizeQuizImageUrl(raw);
    });
  };

  const mountQuizImage = (wrap, src, width = QUIZ_IMAGE_WIDTH, renderGen = 0) => {
    wrap.classList.add("is-loading");
    const canZoom = !MOBILE_MQ.matches;
    if (canZoom) {
      wrap.classList.add("trivia-image-wrap--zoomable");
      wrap.setAttribute("role", "button");
      wrap.setAttribute("tabindex", "-1");
      wrap.setAttribute("aria-label", "View larger image");
    }

    const loader = document.createElement("span");
    loader.className = "trivia-image-loader";
    loader.setAttribute("aria-hidden", "true");

    const img = document.createElement("img");
    img.className = "trivia-image";
    img.alt = "";
    img.decoding = "async";
    img.loading = "eager";
    img.referrerPolicy = "no-referrer";
    img.dataset.fullSrc = String(src || "").trim();

    const candidates = quizImageCandidates(src, width);
    let finished = false;
    let attempt = 0;
    let loadId = 0;

    const finish = () => {
      if (finished) return;
      finished = true;
      wrap.classList.remove("is-loading");
      if (canZoom) wrap.setAttribute("tabindex", "0");
      loader.remove();
    };

    const tryNext = () => {
      if (finished) return;
      if (attempt >= candidates.length) {
        finish();
        return;
      }
      loadId += 1;
      const currentLoad = loadId;
      const url = candidates[attempt++];

      const onLoad = () => {
        if (finished || currentLoad !== loadId || renderGen !== imageRenderGen) return;
        img.removeEventListener("error", onError);
        if (img.naturalWidth > 0) finish();
        else tryNext();
      };
      const onError = () => {
        if (finished || currentLoad !== loadId || renderGen !== imageRenderGen) return;
        img.removeEventListener("load", onLoad);
        tryNext();
      };

      img.addEventListener("load", onLoad);
      img.addEventListener("error", onError);
      img.src = url;

      requestAnimationFrame(() => {
        if (finished || currentLoad !== loadId || renderGen !== imageRenderGen) return;
        if (img.complete && img.naturalWidth > 0) {
          img.removeEventListener("load", onLoad);
          img.removeEventListener("error", onError);
          finish();
        } else if (img.complete) {
          img.removeEventListener("load", onLoad);
          img.removeEventListener("error", onError);
          tryNext();
        }
      });
    };

    wrap.appendChild(loader);
    wrap.appendChild(img);
    tryNext();
  };

  let carouselScrollTimer = null;
  let carouselScrollCleanup = null;

  const getCarouselActiveIndex = (track) => {
    const slides = Array.from(track?.querySelectorAll(".trivia-image-wrap") || []);
    if (slides.length < 2) return 0;
    const mid = track.scrollLeft + track.clientWidth / 2;
    let active = 0;
    let best = Infinity;
    slides.forEach((slide, i) => {
      const center = slide.offsetLeft + slide.offsetWidth / 2;
      const dist = Math.abs(center - mid);
      if (dist < best) {
        best = dist;
        active = i;
      }
    });
    return active;
  };

  const scrollCarouselTo = (track, index) => {
    const slides = track?.querySelectorAll(".trivia-image-wrap");
    const slide = slides?.[index];
    if (!slide || !track) return;
    const left = slide.offsetLeft - (track.clientWidth - slide.offsetWidth) / 2;
    track.scrollTo({ left: Math.max(0, left), behavior: "auto" });
  };

  const syncCarouselControls = (track, dotsEl, prevBtn, nextBtn) => {
    if (!track) return;
    const slides = track.querySelectorAll(".trivia-image-wrap");
    if (slides.length < 2) return;
    const active = getCarouselActiveIndex(track);
    dotsEl?.querySelectorAll(".trivia-carousel-dot").forEach((dot, i) => {
      dot.classList.toggle("is-active", i === active);
      dot.setAttribute("aria-current", i === active ? "true" : "false");
    });
    if (prevBtn) prevBtn.disabled = active <= 0;
    if (nextBtn) nextBtn.disabled = active >= slides.length - 1;
  };

  const teardownCarouselControls = (shell, track) => {
    clearTimeout(carouselScrollTimer);
    carouselScrollTimer = null;
    if (carouselScrollCleanup) {
      carouselScrollCleanup();
      carouselScrollCleanup = null;
    }
    if (!shell) return;
    shell.querySelector(".trivia-carousel-dots")?.remove();
    shell.querySelector(".trivia-carousel-prev")?.remove();
    shell.querySelector(".trivia-carousel-next")?.remove();
    if (track) track.scrollLeft = 0;
  };

  const resetImagesTrack = () => {
    const shell = questionShell?.querySelector(".trivia-images-shell");
    if (!shell) return imagesEl;

    imageRenderGen += 1;
    teardownCarouselControls(shell, imagesEl);

    shell.replaceChildren();
    const next = document.createElement("div");
    next.id = "trivia-images";
    next.className = "trivia-images";
    shell.appendChild(next);
    imagesEl = next;
    return imagesEl;
  };

  const mountCarouselControls = (track, count) => {
    const shell = track.parentElement;
    if (!shell || count < 2) return;

    teardownCarouselControls(shell, track);

    const dotsEl = document.createElement("div");
    dotsEl.className = "trivia-carousel-dots";
    dotsEl.setAttribute("aria-hidden", "true");
    for (let i = 0; i < count; i++) {
      const dot = document.createElement("span");
      dot.className = `trivia-carousel-dot${i === 0 ? " is-active" : ""}`;
      dotsEl.appendChild(dot);
    }

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "trivia-carousel-nav trivia-carousel-prev";
    prevBtn.setAttribute("aria-label", "Previous image");
    prevBtn.textContent = "‹";
    prevBtn.disabled = true;

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "trivia-carousel-nav trivia-carousel-next";
    nextBtn.setAttribute("aria-label", "Next image");
    nextBtn.textContent = "›";

    prevBtn.addEventListener("click", (e) => {
      e.preventDefault();
      scrollCarouselTo(track, getCarouselActiveIndex(track) - 1);
    });
    nextBtn.addEventListener("click", (e) => {
      e.preventDefault();
      scrollCarouselTo(track, getCarouselActiveIndex(track) + 1);
    });

    shell.append(dotsEl, prevBtn, nextBtn);

    const onScroll = () => {
      clearTimeout(carouselScrollTimer);
      carouselScrollTimer = setTimeout(
        () => syncCarouselControls(track, dotsEl, prevBtn, nextBtn),
        60,
      );
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    carouselScrollCleanup = () => track.removeEventListener("scroll", onScroll);

    track.scrollLeft = 0;
    syncCarouselControls(track, dotsEl, prevBtn, nextBtn);
  };

  const poolKey = (type) => {
    if (type === "episode") return "episodes";
    if (type === "character") return "characters";
    if (type === "weapon") return "weapons";
    if (type === "map") return "maps";
    if (type === "item") return "items";
    return "sets";
  };

  const weaponCategoryKey = (row) =>
    String(row?.category || row?.categoryTitle || "").trim() || "__other__";

  const weaponPeerRows = (row, allRows) => {
    const key = weaponCategoryKey(row);
    const same = allRows.filter((r) => weaponCategoryKey(r) === key);
    return same.length >= 4 ? same : allRows;
  };

  const eligiblePool = (type) => {
    if (type === "combo" || type === "hard") {
      return (type === "hard" ? hardPoolsReady() : comboPoolsReady()) ? [{ combo: true }] : [];
    }
    const key = poolKey(type);
    const rows = pool?.[key] || [];
    if (type === "character") {
      return rows.filter((r) => characterImages(r).length >= CHARACTER_MIN_IMAGES);
    }
    if (type === "weapon") {
      return rows.filter((r) => (r.images || []).length >= WEAPON_MIN_IMAGES);
    }
    if (type === "episode") {
      return rows.filter(
        (r) =>
          episodeImages(r).length >= EPISODE_MIN_IMAGES &&
          episodeQuizImages(r).length >= EPISODE_QUIZ_MIN_IMAGES,
      );
    }
    if (type === "map") {
      return rows.filter((r) => mapImages(r).length >= MAP_MIN_IMAGES);
    }
    if (type === "item") {
      return rows.filter((r) => isItemQuizRow(r));
    }
    return rows.filter((r) => (r.images || []).length >= 1);
  };

  const comboPoolsReady = () =>
    BASE_QUIZ_TYPES.every((type) => eligiblePool(type).length >= 4);

  const hardTypeRows = (type) =>
    eligiblePool(type).filter((row) => questionHasImages(type, row, true));

  const hardWeaponPickPool = (rows) =>
    rows.filter((row) => {
      const peers = weaponPeerRows(row, rows);
      return peers.length >= HARD_POOL_MIN || rows.length >= HARD_POOL_MIN;
    });

  const hardPoolsReady = () => {
    if (!comboPoolsReady()) return false;
    return BASE_QUIZ_TYPES.every((type) => {
      const rows = hardTypeRows(type);
      if (type === "weapon") return hardWeaponPickPool(rows).length >= 1 && rows.length >= HARD_POOL_MIN;
      return rows.length >= HARD_POOL_MIN;
    });
  };

  const buildQuestion = (type, row, allRows, { hard = false } = {}) => {
    const imgs = hard ? pickHardQuestionImages(type, row) : pickQuestionImages(type, row);
    const correct = row.display;
    const peerRows = type === "weapon" ? weaponPeerRows(row, allRows) : allRows;
    const others = peerRows.filter((r) => r.display !== correct);
    const distractorCount = hard ? HARD_OPTION_COUNT : 3;
    const distractors = hard
      ? pickHardDistractors(correct, others, distractorCount, allRows)
      : sample(others, distractorCount).map((r) => r.display);
    const options = shuffle([correct, ...distractors]).slice(0, hard ? HARD_OPTION_COUNT + 1 : 4);
    return {
      type,
      correct,
      label: row.display,
      href: row.href || "",
      images: imgs,
      options,
      prompt: QUIZ_META[type].prompt,
      categoryTitle: type === "weapon" ? row.categoryTitle || "" : "",
    };
  };

  const buildQuiz = (type) => {
    if (type === "combo") {
      return buildComboQuiz();
    }
    if (type === "hard") {
      return buildHardQuiz();
    }
    const rows = eligiblePool(type).filter((row) => questionHasImages(type, row));
    if (rows.length < 4) return [];
    let pickFrom = rows;
    if (type === "weapon") {
      pickFrom = rows.filter((row) => weaponPeerRows(row, rows).length >= 4);
      if (pickFrom.length < 4) return [];
    }
    const picked = sample(pickFrom, QUIZ_LENGTH);
    return picked.map((row) => buildQuestion(type, row, rows));
  };

  const buildComboQuiz = () => {
    if (!comboPoolsReady()) return [];

    const pools = Object.fromEntries(
      BASE_QUIZ_TYPES.map((type) => [
        type,
        eligiblePool(type).filter((row) => questionHasImages(type, row)),
      ]),
    );
    const weaponPickPool = pools.weapon.filter(
      (row) => weaponPeerRows(row, pools.weapon).length >= 4,
    );

    const questions = [];
    for (let i = 0; i < QUIZ_LENGTH; i += 1) {
      const type = sample(BASE_QUIZ_TYPES, 1)[0];
      let rows = pools[type];
      if (type === "weapon") rows = weaponPickPool;
      if (!rows.length) return [];
      const row = sample(rows, 1)[0];
      questions.push(buildQuestion(type, row, pools[type]));
    }
    return questions;
  };

  const buildHardQuiz = () => {
    if (!hardPoolsReady()) return [];

    const pools = Object.fromEntries(
      BASE_QUIZ_TYPES.map((type) => [type, hardTypeRows(type)]),
    );
    const weaponPickPool = hardWeaponPickPool(pools.weapon);

    const out = [];
    for (let i = 0; i < HARD_QUIZ_LENGTH; i += 1) {
      const type = sample(BASE_QUIZ_TYPES, 1)[0];
      let rows = pools[type];
      if (type === "weapon") rows = weaponPickPool.length ? weaponPickPool : pools.weapon;
      if (!rows.length) return [];
      const row = sample(rows, 1)[0];
      out.push(buildQuestion(type, row, pools[type], { hard: true }));
    }
    return out;
  };

  const hideNext = () => {
    if (!nextBtn) return;
    clearTimeout(nextGlowTimer);
    nextGlowTimer = null;
    nextBtn.hidden = true;
    nextBtn.classList.remove("is-visible", "is-glowing");
  };

  const showNext = () => {
    if (!nextBtn) return;
    nextBtn.textContent = qIndex >= quizLength - 1 ? "See results" : "Next";
    nextBtn.hidden = false;
    nextBtn.classList.remove("is-glowing");
    requestAnimationFrame(() => {
      nextBtn.classList.add("is-visible");
      requestAnimationFrame(() => nextBtn.classList.add("is-glowing"));
    });
    clearTimeout(nextGlowTimer);
    nextGlowTimer = window.setTimeout(() => {
      nextBtn?.classList.remove("is-glowing");
      nextGlowTimer = null;
    }, 2000);
  };

  const advanceQuestion = () => {
    hideNext();
    qIndex += 1;
    if (qIndex >= quizLength) {
      renderResults();
    } else {
      renderQuestion();
    }
  };

  const showHub = () => {
    hideNext();
    hub.hidden = false;
    quizEl.hidden = true;
    resultsEl.hidden = true;
    quizEl?.classList.remove("trivia-quiz--hard");
    quizType = null;
    questions = [];
    qIndex = 0;
    score = 0;
    answers = [];
    locked = false;
  };

  const showQuiz = () => {
    hub.hidden = true;
    quizEl.hidden = false;
    resultsEl.hidden = true;
    quizEl?.classList.toggle("trivia-quiz--hard", quizType === "hard");
  };

  const showResults = () => {
    hub.hidden = true;
    quizEl.hidden = true;
    resultsEl.hidden = false;
  };

  const renderProgress = () => {
    const n = qIndex + 1;
    const pct = (qIndex / quizLength) * 100;
    progressBar.style.width = `${Math.max(8, pct)}%`;
    progressText.textContent =
      quizType === "hard"
        ? `${Math.min(n, quizLength)} / ${quizLength} · Hard`
        : `${Math.min(n, quizLength)} / ${quizLength}`;
  };

  const renderQuestion = () => {
    const q = questions[qIndex];
    if (!q) return;

    locked = false;
    hideNext();
    hideFeedback();
    questionShell.classList.remove("is-correct", "is-wrong");
    questionEl.replaceChildren();
    if (quizType === "combo" && q.type) {
      const kind = document.createElement("span");
      kind.className = "trivia-question-kind";
      kind.textContent = QUIZ_META[q.type]?.kindLabel || q.type;
      questionEl.appendChild(kind);
    } else if (quizType === "hard") {
      const kind = document.createElement("span");
      kind.className = "trivia-question-kind trivia-question-kind--hard";
      kind.textContent = QUIZ_META[q.type]?.kindLabel || q.type;
      questionEl.appendChild(kind);
    }
    questionEl.append(document.createTextNode(q.prompt));

    resetImagesTrack();
    imagesEl.hidden = !q.images.length;
    imagesEl.className = "trivia-images";
    const isMobile = MOBILE_MQ.matches;
    const imagesShell = questionShell.querySelector(".trivia-images-shell");
    if (imagesShell) imagesShell.hidden = !q.images.length;
    if (q.images.length > 0) {
      imagesEl.classList.add(`trivia-images--${Math.min(q.images.length, 3)}`);
      if (isMobile && q.images.length > 1) imagesEl.classList.add("trivia-images--carousel");
    }

    const renderGen = imageRenderGen;
    q.images.forEach((src) => {
      const wrap = document.createElement("div");
      wrap.className = "trivia-image-wrap";
      mountQuizImage(wrap, src, QUIZ_IMAGE_WIDTH, renderGen);
      imagesEl.appendChild(wrap);
    });

    if (isMobile && q.images.length > 1) {
      mountCarouselControls(imagesEl, q.images.length);
    } else if (imagesShell) {
      teardownCarouselControls(imagesShell, imagesEl);
    }

    const nextQ = questions[qIndex + 1];
    if (nextQ) prefetchImages(nextQ.images);

    optionsEl.innerHTML = "";
    optionsEl.classList.toggle("trivia-options--many", q.options.length > 4);
    q.options.forEach((label) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "trivia-option";
      btn.textContent = label;
      btn.addEventListener("click", () => pickOption(label, btn));
      optionsEl.appendChild(btn);
    });

    renderProgress();
  };

  const pickOption = (label, btn) => {
    if (locked) return;
    locked = true;

    const q = questions[qIndex];
    const correct = label === q.correct;
    if (correct) score += 1;

    answers.push({
      correct: q.correct,
      picked: label,
      ok: correct,
      href: q.href,
      label: q.label || "",
      type: q.type,
      images: q.images || [],
    });

    Array.from(optionsEl.querySelectorAll(".trivia-option")).forEach((el) => {
      el.disabled = true;
      if (el.textContent === q.correct) el.classList.add("is-correct");
      else if (el === btn && !correct) el.classList.add("is-wrong");
    });

    questionShell.classList.add(correct ? "is-correct" : "is-wrong");
    showFeedback(correct, showNext);
  };

  const THUMB_IMAGE_WIDTH = 120;

  const resultIcon = (name) => {
    if (name === "check") {
      return `<svg class="trivia-result-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M9.55 17.05 4.5 12l1.41-1.42 3.64 3.64 8.54-8.54L19.5 6.9z"/></svg>`;
    }
    if (name === "wrong") {
      return `<svg class="trivia-result-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M18.3 5.71 12 12.01 5.7 5.71 4.29 7.12l6.3 6.29-6.3 6.29 1.41 1.41 6.29-6.3 6.29 6.3 1.41-1.41-6.29-6.29 6.29-6.29z"/></svg>`;
    }
    return `<svg class="trivia-result-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>`;
  };

  const renderResults = () => {
    showResults();
    const pct = Math.round((score / quizLength) * 100);
    resultsScore.textContent = `${score} / ${quizLength}`;
    if (quizType === "hard") {
      resultsTitle.textContent =
        pct === 100
          ? "Legendary — you beat Super Hard!"
          : pct >= 60
            ? "Impressive run on brutal mode."
            : pct >= 30
              ? "Super Hard lives up to its name."
              : "That mode is no joke — try again.";
    } else {
      resultsTitle.textContent =
        pct === 100
          ? "Perfect score!"
          : pct >= 70
            ? "Nice work!"
            : pct >= 40
              ? "Not bad — keep studying."
              : "Keep dropping in — you'll get it next time.";
    }

    resultsCard.classList.remove("is-great", "is-ok", "is-low");
    if (quizType === "hard") {
      if (pct >= 60) resultsCard.classList.add("is-great");
      else if (pct >= 30) resultsCard.classList.add("is-ok");
      else resultsCard.classList.add("is-low");
    } else if (pct >= 70) resultsCard.classList.add("is-great");
    else if (pct >= 40) resultsCard.classList.add("is-ok");
    else resultsCard.classList.add("is-low");

    resultsList.innerHTML = "";
    answers.forEach((a) => {
      const li = document.createElement("li");
      li.className = `trivia-result-row ${a.ok ? "is-correct" : "is-wrong"}`;

      const thumbs = document.createElement("div");
      thumbs.className = "trivia-result-thumbs";
      (a.images || []).slice(0, 1).forEach((src) => {
        const canZoom = !MOBILE_MQ.matches;
        const slot = document.createElement("button");
        slot.type = "button";
        slot.className = canZoom
          ? "trivia-result-thumb trivia-result-thumb--zoomable"
          : "trivia-result-thumb";
        if (canZoom) slot.setAttribute("aria-label", "View larger image");
        const img = document.createElement("img");
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        img.referrerPolicy = "no-referrer";
        img.dataset.fullSrc = String(src || "").trim();
        img.src = normalizeQuizImageUrl(src, THUMB_IMAGE_WIDTH);
        slot.appendChild(img);
        thumbs.appendChild(slot);
      });

      const main = document.createElement("div");
      main.className = "trivia-result-main";

      if ((quizType === "combo" || quizType === "hard") && a.type) {
        const kind = document.createElement("span");
        kind.className =
          quizType === "hard" ? "trivia-result-kind trivia-result-kind--hard" : "trivia-result-kind";
        kind.textContent = QUIZ_META[a.type]?.kindLabel || a.type;
        main.appendChild(kind);
      }

      const answer = document.createElement("div");
      answer.className = "trivia-result-answer";
      if (a.ok) {
        const line = document.createElement("span");
        line.className = "trivia-result-line trivia-result-line--ok";
        line.textContent = a.correct;
        answer.appendChild(line);
      } else {
        const wrong = document.createElement("span");
        wrong.className = "trivia-result-line trivia-result-line--bad";
        wrong.textContent = a.picked;
        const right = document.createElement("span");
        right.className = "trivia-result-line trivia-result-line--ok";
        right.textContent = a.correct;
        answer.appendChild(wrong);
        answer.appendChild(right);
      }
      main.appendChild(answer);

      const status = document.createElement("span");
      status.className = `trivia-result-status ${a.ok ? "is-correct" : "is-wrong"}`;
      status.setAttribute("aria-label", a.ok ? "Correct" : "Wrong");
      status.innerHTML = resultIcon(a.ok ? "check" : "wrong");

      li.appendChild(thumbs);
      li.appendChild(main);
      li.appendChild(status);

      if (a.href) {
        const link = document.createElement("a");
        link.className = "trivia-result-page";
        link.href = a.href;
        link.setAttribute("aria-label", "View page");
        link.innerHTML = resultIcon("link");
        li.appendChild(link);
      }

      resultsList.appendChild(li);
    });
  };

  const startQuiz = (type) => {
    if (!pool) return;
    quizType = type;
    quizLength = type === "hard" ? HARD_QUIZ_LENGTH : QUIZ_LENGTH;
    questions = buildQuiz(type);
    if (questions.length < quizLength) {
      window.alert("Not enough data for this quiz yet. Try another one!");
      return;
    }
    qIndex = 0;
    score = 0;
    answers = [];
    showQuiz();
    prefetchImages(questions[0]?.images);
    renderQuestion();
  };

  cardsRoot.addEventListener("click", (e) => {
    const card = e.target.closest("[data-quiz]");
    if (!card || card.disabled) return;
    startQuiz(card.getAttribute("data-quiz"));
  });

  backBtn?.addEventListener("click", showHub);
  homeBtn?.addEventListener("click", showHub);
  nextBtn?.addEventListener("click", advanceQuestion);
  retryBtn?.addEventListener("click", () => {
    if (quizType) startQuiz(quizType);
  });

  fetch("/assets/data/quiz_pool.json?v=20260701")
    .then((r) => {
      if (!r.ok) throw new Error("load failed");
      return r.json();
    })
    .then((data) => {
      pool = data;
      if (loadStatus) loadStatus.hidden = true;

      cardsRoot.querySelectorAll("[data-quiz]").forEach((card) => {
        const type = card.getAttribute("data-quiz");
        const available =
          type === "combo"
            ? comboPoolsReady()
            : type === "hard"
              ? hardPoolsReady()
              : eligiblePool(type).length >= 4;
        card.disabled = !available;
        if (!available) card.classList.add("is-disabled");
      });
    })
    .catch(() => {
      if (loadStatus) {
        loadStatus.textContent = "Could not load quiz data.";
        loadStatus.classList.add("is-error");
      }
      cardsRoot.querySelectorAll("[data-quiz]").forEach((c) => {
        c.disabled = true;
      });
    });

  const triviaPage = document.querySelector(".trivia-page");
  if (triviaPage && window.WikiLightbox) {
    window.WikiLightbox.init({
      pageRoot: triviaPage,
      gather() {
        return Array.from(
          triviaPage.querySelectorAll(
            ".trivia-image-wrap:not(.is-loading) .trivia-image[src], .trivia-result-thumb img[src]",
          ),
        )
          .filter((im) => {
            const s = im.getAttribute("src") || "";
            return s && !s.startsWith("data:");
          })
          .map((im) => ({ img: im, yt: null }));
      },
      resolveImage(e, pageRoot) {
        if (MOBILE_MQ.matches) return null;
        const wrap = e.target.closest(".trivia-image-wrap:not(.is-loading)");
        if (wrap && pageRoot.contains(wrap)) {
          const im = wrap.querySelector(".trivia-image[src]");
          if (im) return im;
        }
        const thumb = e.target.closest(".trivia-result-thumb--zoomable");
        if (thumb && pageRoot.contains(thumb)) {
          const im = thumb.querySelector("img[src]");
          if (im) return im;
        }
        return null;
      },
    });

    triviaPage.addEventListener("keydown", (e) => {
      if (MOBILE_MQ.matches) return;
      if (e.key !== "Enter" && e.key !== " ") return;
      const wrap = e.target.closest(".trivia-image-wrap:not(.is-loading), .trivia-result-thumb--zoomable");
      if (!wrap) return;
      e.preventDefault();
      wrap.click();
    });
  }
})();
