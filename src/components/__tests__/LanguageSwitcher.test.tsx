import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import LanguageSwitcher from "../LanguageSwitcher";
import { useLanguage } from "../../hooks/useLanguage";

jest.mock("../../hooks/useLanguage");

describe("LanguageSwitcher", () => {
    it("shows 'EN' (the next language in the cycle) when currently Czech", () => {
        (useLanguage as jest.Mock).mockReturnValue({ language: "cs", setLanguage: jest.fn() });

        const { getByText } = render(<LanguageSwitcher />);

        expect(getByText("EN")).toBeTruthy();
    });

    it("shows 'UA' when currently English", () => {
        (useLanguage as jest.Mock).mockReturnValue({ language: "en", setLanguage: jest.fn() });

        const { getByText } = render(<LanguageSwitcher />);

        expect(getByText("UA")).toBeTruthy();
    });

    it("shows 'CS' when currently Ukrainian — the cycle wraps back around", () => {
        (useLanguage as jest.Mock).mockReturnValue({ language: "uk", setLanguage: jest.fn() });

        const { getByText } = render(<LanguageSwitcher />);

        expect(getByText("CS")).toBeTruthy();
    });

    it("tapping it switches to the next language in the cycle", () => {
        const setLanguage = jest.fn();
        (useLanguage as jest.Mock).mockReturnValue({ language: "cs", setLanguage });

        const { getByText } = render(<LanguageSwitcher />);
        fireEvent.press(getByText("EN"));

        expect(setLanguage).toHaveBeenCalledWith("en");
    });

    it("tapping while on English switches to Ukrainian", () => {
        const setLanguage = jest.fn();
        (useLanguage as jest.Mock).mockReturnValue({ language: "en", setLanguage });

        const { getByText } = render(<LanguageSwitcher />);
        fireEvent.press(getByText("UA"));

        expect(setLanguage).toHaveBeenCalledWith("uk");
    });
});
