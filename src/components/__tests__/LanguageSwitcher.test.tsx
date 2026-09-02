import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import LanguageSwitcher from "../LanguageSwitcher";
import { useLanguage } from "../../hooks/useLanguage";

jest.mock("../../hooks/useLanguage");

describe("LanguageSwitcher", () => {
    it("shows 'EN' (the language to switch TO) when currently Czech", () => {
        (useLanguage as jest.Mock).mockReturnValue({ language: "cs", setLanguage: jest.fn() });

        const { getByText } = render(<LanguageSwitcher />);

        expect(getByText("EN")).toBeTruthy();
    });

    it("shows 'CS' when currently English", () => {
        (useLanguage as jest.Mock).mockReturnValue({ language: "en", setLanguage: jest.fn() });

        const { getByText } = render(<LanguageSwitcher />);

        expect(getByText("CS")).toBeTruthy();
    });

    it("tapping it switches to the other language", () => {
        const setLanguage = jest.fn();
        (useLanguage as jest.Mock).mockReturnValue({ language: "cs", setLanguage });

        const { getByText } = render(<LanguageSwitcher />);
        fireEvent.press(getByText("EN"));

        expect(setLanguage).toHaveBeenCalledWith("en");
    });
});
