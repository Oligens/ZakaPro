import "./data";

declare module "./data" {
  interface ZakaApp {
    /** URL de webhook dédiée à cette application, issue de apps.webhook_url. */
    webhookUrl?: string;
  }
}
