"use client";

/**
 * AthleteAvatar — circular photo or initials fallback.
 * Photo is loaded from profile_image_url (public Supabase Storage URL).
 */

export default function AthleteAvatar({
  url,
  firstName,
  lastName,
  size = 64,
}: {
  url?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  size?: number;
}) {
  const initials = [firstName, lastName]
    .map((s) => s?.trim()[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2) || "?";

  const dim = `${size}px`;

  if (url) {
    return (
      <img
        src={url}
        alt={`${firstName ?? ""} ${lastName ?? ""}`.trim()}
        width={size}
        height={size}
        className="rounded-full object-cover ring-2 ring-slate-700 shrink-0"
        style={{ width: dim, height: dim }}
        onError={(e) => {
          // Fallback to initials if image fails to load
          (e.currentTarget as HTMLImageElement).style.display = "none";
          const next = e.currentTarget.nextElementSibling as HTMLElement | null;
          if (next) next.style.display = "flex";
        }}
      />
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-slate-800 ring-2 ring-slate-700 text-slate-300 font-semibold select-none"
      style={{ width: dim, height: dim, fontSize: size * 0.35 }}
      aria-hidden
    >
      {initials}
    </div>
  );
}
