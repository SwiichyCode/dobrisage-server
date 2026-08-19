import axios from "axios";

export const dofusDbApiClient = axios.create({
  baseURL: process.env.DOFUSDB_API_URL,
  timeout: 300_000,
  headers: {
    "Content-Type": "application/json",
  },
});
