import { NextResponse } from "next/server";
import { getSunPosition, getSunTimes } from "@/lib/sun";

const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;

function parseNumber(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const latitude = parseNumber(searchParams.get("lat"));
  const longitude = parseNumber(searchParams.get("lng"));
  const timeZone = searchParams.get("tz") ?? "UTC";
  const dateParam = searchParams.get("date");

  if (latitude === null || Math.abs(latitude) > MAX_LATITUDE) {
    return NextResponse.json(
      { error: "Query parameter 'lat' must be a number between -90 and 90." },
      { status: 400 },
    );
  }

  if (longitude === null || Math.abs(longitude) > MAX_LONGITUDE) {
    return NextResponse.json(
      { error: "Query parameter 'lng' must be a number between -180 and 180." },
      { status: 400 },
    );
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    return NextResponse.json(
      { error: `Unknown time zone '${timeZone}'.` },
      { status: 400 },
    );
  }

  const date = dateParam ? new Date(dateParam) : new Date();
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json(
      { error: "Query parameter 'date' must be a valid ISO 8601 date." },
      { status: 400 },
    );
  }

  const times = getSunTimes(date, latitude, longitude, timeZone);
  const position = getSunPosition(date, latitude, longitude);

  return NextResponse.json({
    latitude,
    longitude,
    timeZone,
    position,
    times,
  });
}
