import axios from "axios";

export const dofocusApiClient = axios.create({
  baseURL: process.env.DOFOCUS_API_URL,
  timeout: 10_000,
  headers: {
    "Content-Type": "application/json",
  },
});
