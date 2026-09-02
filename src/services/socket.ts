import { io } from "socket.io-client";
import { BASE_URL, API_KEY } from "../config/env";
import { reportSocketFailure, reportSocketSuccess } from "./connectivity";

export const socket = io(BASE_URL, {
  autoConnect: true,
  auth: { apiKey: API_KEY },
});

socket.on("connect", () => {
  console.log("Connected to socket server");
  reportSocketSuccess();
});

socket.on("connect_error", (err) => {
  console.error("[SOCKET] Connection rejected:", err.message);
  // An auth rejection (wrong/missing API key) isn't a reachability
  // problem — the server responded, just refused the handshake — so it
  // shouldn't trigger the "server unreachable" banner. Only report
  // unreachable for what looks like an actual network-level failure.
  if (err.message !== "Unauthorized" && err.message !== "Server misconfigured") {
    reportSocketFailure();
  }
});

socket.on("disconnect", (reason) => {
  console.log("Disconnected from socket server:", reason);
  reportSocketFailure();
});

export default socket;
