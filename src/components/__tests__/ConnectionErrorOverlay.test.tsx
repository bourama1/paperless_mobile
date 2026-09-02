import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import ConnectionErrorOverlay from "../ConnectionErrorOverlay";
import { useConnectivity } from "../../hooks/useConnectivity";

jest.mock("../../hooks/useConnectivity");

describe("ConnectionErrorOverlay", () => {
    it("renders nothing when the server is reachable", () => {
        (useConnectivity as jest.Mock).mockReturnValue({
            isReachable: true,
            retrying: false,
            retry: jest.fn(),
        });

        const { toJSON } = render(<ConnectionErrorOverlay />);
        expect(toJSON()).toBeNull();
    });

    it("shows the message and a working retry button when unreachable", () => {
        const retry = jest.fn();
        (useConnectivity as jest.Mock).mockReturnValue({
            isReachable: false,
            retrying: false,
            retry,
        });

        const { getByText } = render(<ConnectionErrorOverlay />);

        expect(getByText("Server je nedostupný")).toBeTruthy();
        fireEvent.press(getByText("Zkusit znovu"));
        expect(retry).toHaveBeenCalledTimes(1);
    });

    it("shows a retrying indicator instead of the button while a retry is in flight", () => {
        (useConnectivity as jest.Mock).mockReturnValue({
            isReachable: false,
            retrying: true,
            retry: jest.fn(),
        });

        const { getByText, queryByText } = render(<ConnectionErrorOverlay />);

        expect(getByText("Zkouším se znovu připojit…")).toBeTruthy();
        expect(queryByText("Zkusit znovu")).toBeNull();
    });
});
