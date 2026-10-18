"use client";
import { useState } from "react";
import { ImageOff } from "lucide-react";
import type { Listing } from "@/lib/types";

export default function ListingPhotos({
  item,
  gallery = false,
  large = false,
}: {
  item: Listing;
  gallery?: boolean;
  large?: boolean;
}) {
  const [selected, setSelected] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const photos = (item.images || []).filter((url) => !failed.includes(url));
  const index = Math.min(selected, Math.max(0, photos.length - 1));
  const src = photos[index];
  function unavailable(url: string) {
    setFailed((previous) => [...previous, url]);
  }
  return (
    <div
      className={`listing-photos ${gallery ? "gallery" : large ? "large" : "compact"}`}
    >
      {src ? (
        <div className="listing-photo-main">
          <img
            src={src}
            alt={`${item.title} — seller photo ${index + 1}`}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => unavailable(src)}
          />
        </div>
      ) : (
        <div className="listing-photo-empty">
          <ImageOff size={large || gallery ? 30 : 22} />
          <span>
            {item.images?.length ? "Photo unavailable" : "No listing photo"}
          </span>
        </div>
      )}
      {gallery && photos.length > 0 && (
        <>
          <p className="photo-caption">
            Seller listing photos · {index + 1} of {photos.length}
          </p>
          {photos.length > 1 && (
            <div className="listing-photo-thumbs" aria-label="Listing photos">
              {photos.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  aria-label={`Show seller photo ${i + 1}`}
                  aria-pressed={index === i}
                  onClick={() => setSelected(i)}
                >
                  <img
                    src={url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={() => unavailable(url)}
                  />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
