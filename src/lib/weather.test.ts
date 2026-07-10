import { describe, expect, it } from "vitest";
import { describeWeatherCode, shouldShowWeather } from "./weather";

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDaysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

describe("describeWeatherCode", () => {
  it("mappe un ciel clair", () => {
    expect(describeWeatherCode(0)).toEqual({ icon: "sunny", labelKey: "sunny" });
  });

  it("mappe peu nuageux/nuageux/couvert", () => {
    expect(describeWeatherCode(1)).toEqual({ icon: "partlyCloudy", labelKey: "partlyCloudy" });
    expect(describeWeatherCode(2)).toEqual({ icon: "cloudy", labelKey: "cloudy" });
    expect(describeWeatherCode(3)).toEqual({ icon: "cloudy", labelKey: "overcast" });
  });

  it("mappe le brouillard", () => {
    expect(describeWeatherCode(45)).toEqual({ icon: "foggy", labelKey: "foggy" });
    expect(describeWeatherCode(48)).toEqual({ icon: "foggy", labelKey: "foggy" });
  });

  it("mappe bruine/pluie/averses", () => {
    expect(describeWeatherCode(55)).toEqual({ icon: "drizzle", labelKey: "drizzle" });
    expect(describeWeatherCode(65)).toEqual({ icon: "rainy", labelKey: "rainy" });
    expect(describeWeatherCode(81)).toEqual({ icon: "rainy", labelKey: "showers" });
  });

  it("mappe neige et averses de neige", () => {
    expect(describeWeatherCode(73)).toEqual({ icon: "snowy", labelKey: "snowy" });
    expect(describeWeatherCode(86)).toEqual({ icon: "snowy", labelKey: "snowShowers" });
  });

  it("mappe l'orage", () => {
    expect(describeWeatherCode(95)).toEqual({ icon: "stormy", labelKey: "stormy" });
  });

  it("retombe sur nuageux pour un code inconnu", () => {
    expect(describeWeatherCode(999)).toEqual({ icon: "cloudy", labelKey: "cloudy" });
  });
});

describe("shouldShowWeather", () => {
  it("n'affiche rien en mode sondage (pas de date fixée)", () => {
    expect(shouldShowWeather(null, "poll", true)).toBe(false);
  });

  it("n'affiche rien sans coordonnées connues", () => {
    expect(shouldShowWeather(isoDaysFromNow(2), "fixed", false)).toBe(false);
  });

  it("n'affiche rien plus de 5 jours avant l'événement", () => {
    expect(shouldShowWeather(isoDaysFromNow(6), "fixed", true)).toBe(false);
  });

  it("affiche à partir de J-5", () => {
    expect(shouldShowWeather(isoDaysFromNow(5), "fixed", true)).toBe(true);
  });

  it("affiche le jour même (J0)", () => {
    expect(shouldShowWeather(isoDaysFromNow(0), "fixed", true)).toBe(true);
  });

  it("n'affiche plus rien après l'événement", () => {
    expect(shouldShowWeather(isoDaysFromNow(-1), "fixed", true)).toBe(false);
  });
});
