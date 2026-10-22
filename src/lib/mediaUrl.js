// External media URLs: what is accepted, and what may be embedded.
//
// Two separate questions, deliberately kept apart:
//
//   isSafeHttpUrl  — may this string be stored and shown as a link at all?
//   embedFor       — may it be put inside an <iframe>, and at which address?
//
// The second never passes the visitor's string through. An embeddable provider
// is recognised, its ID extracted, and a fresh canonical embed URL is BUILT
// from that ID. A crafted "youtube.com/embed/x?enablejsapi=1&origin=evil" can
// therefore never reach an iframe src: only the ID survives parsing.
//
// Anything not recognised is still storable — it is rendered as a plain
// external link, never embedded.

// Only these two schemes. javascript:, data:, blob:, file:, vbscript: and the
// rest are rejected outright.
const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

export const MAX_URL_LENGTH = 2000;

// Extensions a browser can play directly from a URL, so the page can use a
// native <video>/<audio> element instead of an embed.
const VIDEO_FILE_EXT = /\.(mp4|webm|ogv|ogg|m4v|mov)$/i;
const AUDIO_FILE_EXT = /\.(mp3|wav|m4a|aac|oga|ogg|flac|weba)$/i;

/**
 * Parses a URL and rejects anything that is not a plain http(s) address.
 * Returns a URL object, or null when the string cannot be trusted.
 */
export function parseSafeUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > MAX_URL_LENGTH) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!SAFE_PROTOCOLS.has(url.protocol)) return null;
  // Embedded credentials ("https://user:pass@host") are a phishing shape and
  // are never needed for public media.
  if (url.username || url.password) return null;
  if (!url.hostname) return null;
  return url;
}

export function isSafeHttpUrl(value) {
  return parseSafeUrl(value) !== null;
}

// Host matching that is not fooled by "evil-youtube.com" or "youtube.com.evil.net":
// the candidate must be the host itself or a subdomain of it.
function hostIs(hostname, domain) {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  return h === domain || h.endsWith(`.${domain}`);
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;
const IG_CODE = /^[A-Za-z0-9_-]{5,30}$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{10,40}$/;

function youtubeId(url) {
  if (hostIs(url.hostname, "youtu.be")) {
    const id = url.pathname.split("/").filter(Boolean)[0] || "";
    return YT_ID.test(id) ? id : "";
  }
  if (!hostIs(url.hostname, "youtube.com") && !hostIs(url.hostname, "youtube-nocookie.com")) return "";
  const parts = url.pathname.split("/").filter(Boolean);
  // /watch?v=ID
  if (parts[0] === "watch") {
    const id = url.searchParams.get("v") || "";
    return YT_ID.test(id) ? id : "";
  }
  // /shorts/ID, /embed/ID, /live/ID, /v/ID
  if (["shorts", "embed", "live", "v"].includes(parts[0])) {
    const id = parts[1] || "";
    return YT_ID.test(id) ? id : "";
  }
  return "";
}

// A YouTube address can name a video, a channel or a playlist, and the three
// are not interchangeable. Turning a channel link into a video embed — or
// the reverse — sends the visitor somewhere the editor did not choose, so
// each is recognised separately and the original destination is preserved.
const YT_CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const YT_HANDLE = /^@[A-Za-z0-9._-]{3,30}$/;
const YT_VANITY = /^[A-Za-z0-9._-]{1,100}$/;
const YT_PLAYLIST = /^[A-Za-z0-9_-]{12,42}$/;

const isYouTubeHost = (url) =>
  hostIs(url.hostname, "youtube.com") || hostIs(url.hostname, "youtube-nocookie.com");

// The channel a URL names, in the form YouTube itself serves it. Returns ""
// when the address is not a channel.
function youtubeChannel(url) {
  if (!isYouTubeHost(url)) return "";
  const parts = url.pathname.split("/").filter(Boolean);
  if (!parts.length) return "";
  // /@handle — the current form.
  if (YT_HANDLE.test(parts[0])) return `https://www.youtube.com/${parts[0]}`;
  // /channel/UC… — the canonical id.
  if (parts[0] === "channel" && YT_CHANNEL_ID.test(parts[1] || "")) {
    return `https://www.youtube.com/channel/${parts[1]}`;
  }
  // /c/Name and /user/Name — older vanity forms, still live.
  if (["c", "user"].includes(parts[0]) && YT_VANITY.test(parts[1] || "")) {
    return `https://www.youtube.com/${parts[0]}/${parts[1]}`;
  }
  return "";
}

// The playlist a URL names. A /watch?v=…&list=… address is a VIDEO that
// happens to sit in a playlist, so it is deliberately not matched here —
// youtubeId claims it first.
function youtubePlaylist(url) {
  if (!isYouTubeHost(url)) return "";
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "playlist") return "";
  const id = url.searchParams.get("list") || "";
  return YT_PLAYLIST.test(id) ? id : "";
}

function vimeoId(url) {
  if (!hostIs(url.hostname, "vimeo.com")) return "";
  const parts = url.pathname.split("/").filter(Boolean);
  // /123456789 and /video/123456789 (player.vimeo.com)
  const candidate = parts[0] === "video" ? parts[1] : parts[0];
  return VIMEO_ID.test(candidate || "") ? candidate : "";
}

function instagramCode(url) {
  if (!hostIs(url.hostname, "instagram.com")) return "";
  const parts = url.pathname.split("/").filter(Boolean);
  // /reel/CODE, /reels/CODE, /p/CODE, /tv/CODE — and the same under a profile.
  const at = parts.findIndex((p) => ["reel", "reels", "p", "tv"].includes(p));
  if (at === -1) return "";
  const code = parts[at + 1] || "";
  return IG_CODE.test(code) ? code : "";
}

function spotifyEpisode(url) {
  if (!hostIs(url.hostname, "spotify.com")) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  // /episode/ID, /show/ID, and the /intl-xx/ prefixed variants.
  const at = parts.findIndex((p) => ["episode", "show"].includes(p));
  if (at === -1) return null;
  const id = parts[at + 1] || "";
  if (!SPOTIFY_ID.test(id)) return null;
  return { kind: parts[at], id };
}

/**
 * How a video URL should be rendered.
 *
 * Returns null when the URL is not safe to store at all. Otherwise:
 *   { provider, kind, mode, src, url }
 *     provider — "youtube" | "vimeo" | "instagram" | "file" | "link"
 *     kind     — "video" | "channel" | "playlist" | "file" | "page"
 *                what the address NAMES, which is not the same question as
 *                how it is rendered: a channel is a real YouTube
 *                destination that simply must not be embedded as a video.
 *     mode     — "iframe" | "video" | "link"
 *     src      — the address to put in the iframe/video element (built here),
 *                or "" when the only safe rendering is an external link
 *     url      — the normalised original, for the "open in a new tab" link
 */
export function videoEmbed(value) {
  const url = parseSafeUrl(value);
  if (!url) return null;

  const yt = youtubeId(url);
  if (yt) {
    return {
      provider: "youtube",
      kind: "video",
      mode: "iframe",
      // -nocookie is YouTube's no-tracking-until-play host.
      src: `https://www.youtube-nocookie.com/embed/${yt}?rel=0`,
      url: url.href,
    };
  }

  // A channel is a YouTube destination in its own right. It is never turned
  // into a video embed; it is offered as a link that opens the channel.
  const channel = youtubeChannel(url);
  if (channel) {
    return { provider: "youtube", kind: "channel", mode: "link", src: "", url: channel };
  }

  const playlist = youtubePlaylist(url);
  if (playlist) {
    return {
      provider: "youtube",
      kind: "playlist",
      mode: "iframe",
      src: `https://www.youtube-nocookie.com/embed/videoseries?list=${playlist}`,
      url: url.href,
    };
  }

  const vimeo = vimeoId(url);
  if (vimeo) {
    return { provider: "vimeo", kind: "video", mode: "iframe", src: `https://player.vimeo.com/video/${vimeo}`, url: url.href };
  }

  const ig = instagramCode(url);
  if (ig) {
    return { provider: "instagram", kind: "video", mode: "iframe", src: `https://www.instagram.com/reel/${ig}/embed/`, url: url.href };
  }

  // A direct file over https can be played by the browser itself — no embed,
  // no third party. http is allowed to be stored but not auto-played, because
  // a mixed-content request is blocked on an https page anyway.
  if (VIDEO_FILE_EXT.test(url.pathname)) {
    return {
      provider: "file",
      kind: "file",
      mode: url.protocol === "https:" ? "video" : "link",
      src: url.protocol === "https:" ? url.href : "",
      url: url.href,
    };
  }

  return { provider: "link", kind: "page", mode: "link", src: "", url: url.href };
}

/**
 * How an audio URL should be rendered. Same contract as videoEmbed.
 *   provider — "file" | "spotify" | "link"
 *   mode     — "audio" | "iframe" | "link"
 */
export function audioEmbed(value) {
  const url = parseSafeUrl(value);
  if (!url) return null;

  if (AUDIO_FILE_EXT.test(url.pathname)) {
    return {
      provider: "file",
      mode: url.protocol === "https:" ? "audio" : "link",
      src: url.protocol === "https:" ? url.href : "",
      url: url.href,
    };
  }

  const spotify = spotifyEpisode(url);
  if (spotify) {
    return {
      provider: "spotify",
      mode: "iframe",
      src: `https://open.spotify.com/embed/${spotify.kind}/${spotify.id}`,
      url: url.href,
    };
  }

  // Apple Podcasts, Google Podcasts, JioSaavn, an RSS episode page: storable
  // and linkable, not embeddable. The page offers "listen on …" instead.
  return { provider: "link", mode: "link", src: "", url: url.href };
}

/** The provider name to persist alongside the URL, "" when unrecognised. */
export const videoProvider = (value) => videoEmbed(value)?.provider ?? "";
/** What the address names: video, channel, playlist, file or page. */
export const videoKind = (value) => videoEmbed(value)?.kind ?? "";
export const audioProvider = (value) => audioEmbed(value)?.provider ?? "";
