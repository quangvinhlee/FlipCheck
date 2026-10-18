"use client";
import { useEffect, useRef, useState } from "react";
import { LocateFixed, MapPin, Search } from "lucide-react";
import type { SearchLocation, MarketplaceSource } from "@/lib/types";

export default function SearchLocationFields({
  sources,
  setSources,
  location,
  setLocation,
  csrfToken,
  facebookConfigured,
}: {
  sources: MarketplaceSource[];
  setSources: (value: MarketplaceSource[]) => void;
  location: SearchLocation | null;
  setLocation: (value: SearchLocation | null) => void;
  csrfToken: string;
  facebookConfigured: boolean;
}) {
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<SearchLocation[]>([]);
  const [finding, setFinding] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function toggle(source: MarketplaceSource, checked: boolean) {
    setSources(
      checked ? [...sources, source] : sources.filter((s) => s !== source),
    );
  }
  function usePosition() {
    setError("");
    if (!navigator.geolocation) {
      setError(
        "Location is unavailable in this browser. Find your suburb or postcode below.",
      );
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!mounted.current) return;
        setLocation({
          latitude: Number(position.coords.latitude.toFixed(3)),
          longitude: Number(position.coords.longitude.toFixed(3)),
          label: "Approximate device location",
        });
        setLocating(false);
      },
      (failure) => {
        if (!mounted.current) return;
        setLocating(false);
        setError(
          failure.code === 1
            ? "Location access was denied. Find your suburb or postcode below."
            : "Could not get your position. Try again or find your suburb below.",
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }
  async function findPlace() {
    setError("");
    setFinding(true);
    setPlaces([]);
    try {
      const r = await fetch("/api/location/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-FlipCheck-Token": csrfToken,
        },
        body: JSON.stringify({ query }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "Location search failed.");
      if (mounted.current) {
        setPlaces(data.places);
        if (!data.places.length)
          setError(
            "No Australian location found. Try adding your state or postcode.",
          );
      }
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "Location search failed.");
    } finally {
      if (mounted.current) setFinding(false);
    }
  }
  return (
    <>
      <fieldset className="source-picker">
        <legend>Search marketplaces</legend>
        <label>
          <input
            type="checkbox"
            checked={sources.includes("ebay")}
            onChange={(e) => toggle("ebay", e.target.checked)}
          />
          <span>eBay Australia</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={sources.includes("facebook")}
            onChange={(e) => toggle("facebook", e.target.checked)}
          />
          <span>Facebook Marketplace</span>
        </label>
      </fieldset>
      {sources.includes("facebook") && (
        <section
          className="location-picker"
          aria-label="Facebook pickup location"
        >
          <div className="location-heading">
            <MapPin size={18} />
            <div>
              <strong>Find listings close to you</strong>
              <p>
                Choose a pickup area. Location access happens only when you
                click below.
              </p>
            </div>
          </div>
          {!facebookConfigured && (
            <p className="location-setup" role="status">
              Facebook setup needed: add APIFY_TOKEN to your private .env and
              restart. Your search can still be saved.
            </p>
          )}
          <button
            type="button"
            className="button secondary"
            onClick={usePosition}
            disabled={locating}
          >
            <LocateFixed size={16} />
            {locating ? "Finding your position…" : "Use my location"}
          </button>
          {location && (
            <div className="chosen-location" role="status">
              <MapPin size={16} />
              <span>
                <strong>{location.label}</strong>
                <small>
                  {location.latitude.toFixed(3)},{" "}
                  {location.longitude.toFixed(3)} · approximate center
                </small>
              </span>
            </div>
          )}
          <div className="place-lookup">
            <label className="field">
              <span>Suburb or postcode</span>
              <input
                value={query}
                maxLength={120}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Suburb, state or postcode"
                type="text"
              />
            </label>
            <button
              type="button"
              className="button secondary"
              onClick={() => void findPlace()}
              disabled={finding || query.trim().length < 2}
            >
              <Search size={15} />
              {finding ? "Finding…" : "Find location"}
            </button>
          </div>
          {places.length > 0 && (
            <ul className="place-results" aria-label="Choose a location">
              {places.map((place, index) => (
                <li key={index}>
                  <button
                    type="button"
                    onClick={() => {
                      setLocation(place);
                      setPlaces([]);
                      setError("");
                    }}
                  >
                    {place.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <small className="location-privacy">
            Searches send product terms and rounded coordinates to
            Apify/Facebook. Place lookup uses Nominatim · © OpenStreetMap
            contributors. Distance is approximate, not driving distance.
          </small>
        </section>
      )}
    </>
  );
}
