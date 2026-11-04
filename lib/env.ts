import dotenv from 'dotenv';
dotenv.config({ quiet: true });

export function basicAuthHeader(): Record<string, string> {
  const { HTTP_USERNAME: u, HTTP_PASSWORD: p } = process.env;
  return u ? { Authorization: `Basic ${Buffer.from(`${u}:${p ?? ''}`).toString('base64')}` } : {};
}
