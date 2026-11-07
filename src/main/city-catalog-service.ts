import { z } from "zod";
import type {
  BossCityCatalog,
  BossCityCatalogGroup,
  CollectorCity,
} from "../shared/contracts";
import { JobDatabase } from "./database";

const CITY_API =
  "https://www.zhipin.com/wapi/zpCommon/data/cityGroup.json";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

const hotCitySeeds: CollectorCity[] = [
  { name: "全国", code: 100010000 },
  { name: "北京", code: 101010100 },
  { name: "上海", code: 101020100 },
  { name: "广州", code: 101280100 },
  { name: "深圳", code: 101280600 },
  { name: "杭州", code: 101210100 },
  { name: "天津", code: 101030100 },
  { name: "西安", code: 101110100 },
  { name: "苏州", code: 101190400 },
  { name: "武汉", code: 101200100 },
  { name: "厦门", code: 101230200 },
  { name: "长沙", code: 101250100 },
  { name: "成都", code: 101270100 },
  { name: "郑州", code: 101180100 },
  { name: "重庆", code: 101040100 },
];

const RawCitySchema = z.object({
  name: z.string(),
  code: z.number().int().positive(),
});

const RawCityGroupSchema = z.object({
  firstChar: z.string(),
  cityList: z.array(RawCitySchema),
});

const RawCityResponseSchema = z.object({
  code: z.number(),
  zpData: z.object({
    cityGroup: z.array(RawCityGroupSchema),
  }),
});

const CachedCatalogSchema = z.object({
  hotCities: z.array(z.object({ name: z.string(), code: z.number() })),
  groups: z.array(
    z.object({
      firstChar: z.string(),
      cities: z.array(z.object({ name: z.string(), code: z.number() })),
    }),
  ),
  source: z.enum(["network", "cache", "fallback"]),
  updatedAt: z.string(),
});

export class CityCatalogService {
  constructor(private readonly database: JobDatabase) {}

  async get(force = false): Promise<BossCityCatalog> {
    if (!force) {
      const cached = this.readCache();
      if (
        cached &&
        Date.now() - Date.parse(cached.updatedAt) < CACHE_TTL_MS
      ) {
        return { ...cached, source: "cache" };
      }
    }
    try {
      const response = await fetch(
        process.env.JOB_WORKBENCH_CITY_API || CITY_API,
        {
          headers: {
            accept: "application/json, text/plain, */*",
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/132 Safari/537.36",
          },
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!response.ok) {
        throw new Error(`城市服务返回 HTTP ${response.status}`);
      }
      const catalog = parseBossCityCatalog(await response.json());
      this.database.setAppSetting(
        "collector.cityCatalog",
        JSON.stringify(catalog),
      );
      return catalog;
    } catch {
      const cached = this.readCache();
      if (cached) return { ...cached, source: "cache" };
      return fallbackCatalog();
    }
  }

  private readCache(): BossCityCatalog | null {
    const raw = this.database.getAppSetting("collector.cityCatalog");
    if (!raw) return null;
    try {
      return CachedCatalogSchema.parse(JSON.parse(raw)) as BossCityCatalog;
    } catch {
      return null;
    }
  }
}

export function parseBossCityCatalog(value: unknown): BossCityCatalog {
  const raw = RawCityResponseSchema.parse(value);
  if (raw.code !== 0) throw new Error("BOSS 城市服务返回异常");
  const groups: BossCityCatalogGroup[] = raw.zpData.cityGroup
    .map((group) => ({
      firstChar: group.firstChar.trim(),
      cities: dedupeCities(group.cityList),
    }))
    .filter((group) => group.firstChar && group.cities.length);
  const allCities = groups.flatMap((group) => group.cities);
  const byName = new Map(allCities.map((city) => [city.name, city]));
  const hotCities = hotCitySeeds.map(
    (city) => byName.get(city.name) || city,
  );
  if (!groups.length) throw new Error("BOSS 城市目录为空");
  return {
    hotCities,
    groups,
    source: "network",
    updatedAt: new Date().toISOString(),
  };
}

function dedupeCities(cities: CollectorCity[]): CollectorCity[] {
  const seen = new Set<number>();
  return cities
    .map((city) => ({ name: city.name.trim(), code: city.code }))
    .filter((city) => {
      if (!city.name || seen.has(city.code)) return false;
      seen.add(city.code);
      return true;
    });
}

function fallbackCatalog(): BossCityCatalog {
  return {
    hotCities: hotCitySeeds,
    groups: [
      {
        firstChar: "H",
        cities: [
          { name: "杭州", code: 101210100 },
          { name: "宁波", code: 101210400 },
          { name: "嘉兴", code: 101210300 },
          { name: "丽水", code: 101210800 },
          { name: "温州", code: 101210700 },
        ],
      },
    ],
    source: "fallback",
    updatedAt: new Date(0).toISOString(),
  };
}
