const { bumpVersion } = require("../sync-version-code");

describe("bumpVersion", () => {
    it("bumps the patch number and computes the matching versionCode", () => {
        expect(bumpVersion("1.2.15")).toEqual({ version: "1.2.16", versionCode: 10216 });
    });

    it("bumps correctly right below the two-digit limit", () => {
        expect(bumpVersion("1.0.98")).toEqual({ version: "1.0.99", versionCode: 10099 });
    });

    it("throws instead of colliding once the patch bump would reach 100", () => {
        expect(() => bumpVersion("1.2.99")).toThrow(/bump major\/minor by hand/i);
    });

    it("throws instead of colliding when minor is already >= 100", () => {
        expect(() => bumpVersion("1.100.0")).toThrow(/bump major\/minor by hand/i);
    });

    it("rejects a version string that isn't plain major.minor.patch", () => {
        expect(() => bumpVersion("1.2")).toThrow(/isn't a plain major.minor.patch/i);
        expect(() => bumpVersion("1.2.x")).toThrow(/isn't a plain major.minor.patch/i);
    });
});
