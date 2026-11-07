import { describe, expect, it } from "vitest";
import { parseBossCityCatalog } from "./city-catalog-service";

describe("BOSS city catalog parser", () => {
  it("parses groups, removes duplicates and fills hot city codes", () => {
    const result = parseBossCityCatalog({
      code: 0,
      zpData: {
        cityGroup: [
          {
            firstChar: "H",
            cityList: [
              { name: "杭州", code: 101210100 },
              { name: "杭州", code: 101210100 },
              { name: "湖州", code: 101210500 },
            ],
          },
        ],
      },
    });
    expect(result.groups[0].cities).toEqual([
      { name: "杭州", code: 101210100 },
      { name: "湖州", code: 101210500 },
    ]);
    expect(result.hotCities.find((city) => city.name === "杭州")).toEqual({
      name: "杭州",
      code: 101210100,
    });
    expect(result.hotCities.find((city) => city.name === "北京")?.code).toBe(
      101010100,
    );
  });
});
