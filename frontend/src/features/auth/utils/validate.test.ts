import { describe, expect, it } from "vitest";
import { validateStrongPassword } from "./validate";

describe("validateStrongPassword", () => {
  it("accepts a password that meets the backend policy", () => {
    expect(validateStrongPassword("N3w!Passw0rd")).toBe("");
  });

  it.each([
    ["", "required"],
    ["Sh0rt!", "at least 8"],
    ["lowercase1!", "uppercase"],
    ["UPPERCASE1!", "lowercase"],
    ["NoDigits!!", "number"],
    ["NoSpecial12", "special"],
  ])("rejects %j", (password, expected) => {
    expect(validateStrongPassword(password).toLowerCase()).toContain(expected);
  });
});
