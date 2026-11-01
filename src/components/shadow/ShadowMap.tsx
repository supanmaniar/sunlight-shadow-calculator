"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, GeoJSONSource, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { SceneData } from "@/lib/shadow/osm";
import {
  buildBuildingCollection,
  buildShadowCollection,
  buildSunPath,
  buildTreeCollection,
} from "@/lib/shadow/geojson";
import type { SunPosition } from "@/lib/sun";

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

// Bundlers cannot resolve MapLibre's worker automatically, so it is served from
// `public/` (kept in sync by the `sync:maplibre-worker` npm script).
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const EMPTY: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

type ShadowMapProps = {
  center: [number, number];
  scene: SceneData | null;
  position: SunPosition;
  dateKey: string;
  fov: number;
  bearing: number;
  pitch: number;
  positionAt: (date: Date) => SunPosition;
  onCameraChange?: (camera: { pitch: number; bearing: number; zoom: number }) => void;
};

export function ShadowMap({
  center,
  scene,
  position,
  dateKey,
  fov,
  bearing,
  pitch,
  positionAt,
  onCameraChange,
}: ShadowMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  // True while a camera change we initiated is still animating, so the
  // resulting moveend is not reported back as a user gesture.
  const applyingRef = useRef(false);
  // State (not a ref) so the data effects re-run once the style has loaded,
  // even when the scene arrived before the map was ready.
  const [ready, setReady] = useState(false);

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: STYLE_URL,
      center,
      zoom: 16.2,
      // Start from the requested orientation so a shared URL opens at the
      // viewpoint it encodes, instead of snapping back to a default.
      pitch,
      bearing,
      maxPitch: 85,
      attributionControl: { compact: true },
    });

    mapRef.current = map;

    map.on("load", () => {
      // Hide the basemap's flat building layer so only our 3D version shows.
      if (map.getLayer("building")) map.setLayoutProperty("building", "visibility", "none");
      if (map.getLayer("building-3d")) {
        map.setLayoutProperty("building-3d", "visibility", "none");
      }

      map.addSource("scene-buildings", { type: "geojson", data: EMPTY });
      map.addSource("scene-trees", { type: "geojson", data: EMPTY });
      map.addSource("scene-shadows", { type: "geojson", data: EMPTY });
      map.addSource("sun-path", { type: "geojson", data: EMPTY });

      map.addLayer({
        id: "scene-shadows",
        type: "fill",
        source: "scene-shadows",
        paint: {
          "fill-color": "#1e293b",
          "fill-opacity": 0.55,
          "fill-outline-color": "rgba(15,23,42,0.25)",
        },
      });

      map.addLayer({
        id: "scene-buildings",
        type: "fill-extrusion",
        source: "scene-buildings",
        paint: {
          "fill-extrusion-color": [
            "interpolate",
            ["linear"],
            ["get", "height"],
            0,
            "#e7e5e4",
            40,
            "#d6d3d1",
            120,
            "#a8a29e",
          ],
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": ["get", "minHeight"],
          "fill-extrusion-opacity": 0.92,
          "fill-extrusion-vertical-gradient": true,
        },
      });

      map.addLayer({
        id: "scene-trees",
        type: "circle",
        source: "scene-trees",
        paint: {
          "circle-color": "#4d7c0f",
          "circle-opacity": 0.85,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            14,
            ["*", ["get", "crownRadius"], 0.6],
            18,
            ["*", ["get", "crownRadius"], 2.4],
          ],
          "circle-stroke-color": "#365314",
          "circle-stroke-width": 1,
        },
      });

      map.addLayer({
        id: "sun-path",
        type: "line",
        source: "sun-path",
        paint: {
          "line-color": "#f59e0b",
          "line-width": 2.5,
          "line-dasharray": [2, 2],
          "line-opacity": 0.95,
        },
      });

      map.addSource("sun-marker", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "sun-marker",
        type: "circle",
        source: "sun-marker",
        paint: {
          "circle-color": "#fbbf24",
          "circle-radius": 7,
          "circle-stroke-color": "#b45309",
          "circle-stroke-width": 2,
        },
      });

      setReady(true);
      map.resize();
    });

    map.on("moveend", () => {
      if (!onCameraChange) return;
      // Ignore the echo of a camera move we started ourselves. Without this,
      // applying `bearing` from state fires moveend, which writes a new
      // bearing back to state, which applies it again — an endless loop.
      if (applyingRef.current) return;
      onCameraChange({
        pitch: map.getPitch(),
        bearing: map.getBearing(),
        zoom: map.getZoom(),
      });
    });

    return () => {
      setReady(false);
      map.remove();
      mapRef.current = null;
    };
    // The map is created once; later prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply the field of view (camera focal length).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setVerticalFieldOfView(fov);
  }, [fov, ready]);

  // Apply orientation from state. This is what makes a shared URL restore the
  // exact viewpoint, and what lets the compass and preset buttons drive the
  // camera. Skipped when the map already matches, so it never fights a drag.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const bearingDiff = Math.abs(map.getBearing() - bearing);
    const pitchDiff = Math.abs(map.getPitch() - pitch);
    if (bearingDiff < 0.01 && pitchDiff < 0.01) return;

    applyingRef.current = true;
    map.easeTo({ bearing, pitch, duration: 450 });
    // Clear the guard once the animation settles, whether or not moveend fires.
    const timer = setTimeout(() => {
      applyingRef.current = false;
    }, 600);
    return () => clearTimeout(timer);
  }, [bearing, pitch, ready]);

  // Recenter when the location changes. Depend on the coordinates rather than
  // the array, because the parent builds a fresh array on every render — that
  // would re-run easeTo on every camera move and fight the user's panning.
  const centerLng = center[0];
  const centerLat = center[1];
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ center: [centerLng, centerLat], duration: 800 });
  }, [centerLng, centerLat]);

  // Push scene geometry into the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const buildings = map.getSource("scene-buildings") as
      | GeoJSONSource
      | undefined;
    const trees = map.getSource("scene-trees") as
      | GeoJSONSource
      | undefined;

    buildings?.setData(
      scene ? buildBuildingCollection(scene.buildings) : EMPTY,
    );
    trees?.setData(scene ? buildTreeCollection(scene.trees) : EMPTY);
  }, [scene, ready]);

  // Recompute shadows whenever the sun moves.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const shadows = map.getSource("scene-shadows") as
      | GeoJSONSource
      | undefined;
    const sunPath = map.getSource("sun-path") as
      | GeoJSONSource
      | undefined;

    shadows?.setData(
      scene
        ? buildShadowCollection(
            scene.buildings,
            scene.trees,
            position.azimuth,
            position.elevation,
          )
        : EMPTY,
    );

    if (scene) {
      const points = buildSunPath(
        scene.center[1],
        scene.center[0],
        dateKey,
        positionAt,
      );
      sunPath?.setData({
        type: "FeatureCollection",
        features:
          points.length > 1
            ? [
                {
                  type: "Feature",
                  properties: {},
                  geometry: { type: "LineString", coordinates: points },
                },
              ]
            : [],
      });
    } else {
      sunPath?.setData(EMPTY);
    }

    // Marker showing where the sun currently sits on the arc.
    const marker = map.getSource("sun-marker") as GeoJSONSource | undefined;
    if (scene && position.elevation > 0) {
      const azimuthRad = (position.azimuth * Math.PI) / 180;
      const radius = 120;
      const metresPerDegreeLng =
        111_320 * Math.cos((scene.center[1] * Math.PI) / 180);
      marker?.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Point",
              coordinates: [
                scene.center[0] + (radius * Math.sin(azimuthRad)) / metresPerDegreeLng,
                scene.center[1] + (radius * Math.cos(azimuthRad)) / 111_320,
              ],
            },
          },
        ],
      });
    } else {
      marker?.setData(EMPTY);
    }
  }, [scene, position, dateKey, positionAt, ready]);

  return <div ref={containerRef} className="h-full w-full" />;
}
