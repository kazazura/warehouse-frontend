const getRequiredEnv = (key: "VITE_SUPABASE_URL" | "VITE_SUPABASE_KEY"): string => {
  const viteValue =
    typeof import.meta !== "undefined" && import.meta.env
      ? import.meta.env[key]
      : undefined;
  const processValue =
    typeof process !== "undefined" && process.env
      ? process.env[key]
      : undefined;
  const value = viteValue ?? processValue;

  if (!value) {
    const message = `Missing required environment variable: ${key}. Add it to your .env file.`;
    console.error(message);
    throw new Error(message);
  }

  return value;
};

export const SUPABASE_URL = getRequiredEnv("VITE_SUPABASE_URL");
export const SUPABASE_KEY = getRequiredEnv("VITE_SUPABASE_KEY");
